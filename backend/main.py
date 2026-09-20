from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from fastapi import FastAPI

from agent import graph
from app.routes import router as expense_router

app = FastAPI(title="Expense Tracker API")
app.include_router(expense_router)

add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="expense_agent",
        description="Personal expense tracking assistant",
        graph=graph,
    ),
    path="/agents/expense",
)
