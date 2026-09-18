import asyncio
import json
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from pydantic import Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import DEMO_USER_ID, sqlite_engine

from app.database import Base
from app.models import Category, Expense, User
from tools import expenses


class RecordingModel(FakeMessagesListChatModel):
    calls: list[list[BaseMessage]] = Field(default_factory=list)
    tool_names: list[str] = Field(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        self.tool_names = [
            tool["name"] if isinstance(tool, dict) else tool.name for tool in tools
        ]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.calls.append(list(messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


@pytest.mark.parametrize("write_fails", [False, True])
def test_agent_runs_real_tool_and_preserves_copilot_context(
    tmp_path, monkeypatch, write_fails
):
    from agent import create_expense_agent

    engine = sqlite_engine(tmp_path / "agent.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)
    model = RecordingModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "add_expense",
                        "id": "expense-call",
                        "args": {
                            "merchant": "Aldi",
                            "amount": "30.10",
                            "category": "groceries",
                            "spent_at": "2026-09-18",
                        },
                    }
                ],
            ),
            AIMessage(content="Scripted final response; not a live-model evaluation."),
        ]
    )
    graph = create_expense_agent(model=model)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                session.add(
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo")
                )
                await session.flush()
                session.add(Category(user_id=DEMO_USER_ID, name="groceries"))
                await session.commit()
            if write_fails:
                async with engine.begin() as connection:
                    await connection.execute(
                        text(
                            "CREATE TRIGGER reject_expense BEFORE INSERT ON expenses "
                            "BEGIN SELECT RAISE(ABORT, 'write failed'); END"
                        )
                    )
            with patch("agent.datetime") as clock:
                clock.now.side_effect = [
                    datetime(2026, 9, 18, 23, 59, tzinfo=ZoneInfo("Europe/Berlin")),
                    datetime(2026, 9, 19, 0, 0, tzinfo=ZoneInfo("Europe/Berlin")),
                ]
                result = await graph.ainvoke(
                    {
                        "messages": [
                            {"role": "user", "content": "đi Aldi hết 30.10 euros"}
                        ],
                        "copilotkit": {
                            "context": [
                                {
                                    "description": "Current page",
                                    "value": "expense-dashboard",
                                }
                            ],
                            "actions": [
                                {
                                    "name": "show_help",
                                    "description": "Show help",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {},
                                    },
                                }
                            ],
                        },
                    }
                )
            assert len(model.calls) == 2
            assert "2026-09-18" in model.calls[0][0].content
            assert "2026-09-19" in model.calls[1][0].content
            assert "Europe/Berlin" in model.calls[0][0].content
            assert "expense-dashboard" in model.calls[0][0].content
            assert {"add_expense", "show_help"} <= set(model.tool_names)
            observed = next(m for m in model.calls[1] if isinstance(m, ToolMessage))
            output = json.loads(observed.content)
            assert observed.tool_call_id == "expense-call"
            assert output["status"] == ("error" if write_fails else "created")
            assert result["messages"][-1].content == model.responses[-1].content
            async with sessions() as session:
                rows = list(await session.scalars(select(Expense)))
                assert len(rows) == (0 if write_fails else 1)
                if not write_fails:
                    assert str(rows[0].id) == output["expense"]["id"]
                    assert output["expense"]["amount"] == "30.10"
                else:
                    assert output["code"] == "EXPENSE_WRITE_FAILED"
        finally:
            await engine.dispose()

    asyncio.run(run())
