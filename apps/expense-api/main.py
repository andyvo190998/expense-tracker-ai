from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from agent import graph
from app.admin_routes import router as admin_router
from app.agent_auth import AgentAuthMiddleware
from app.auth_routes import router as auth_router
from app.auth_services import AuthFailure
from app.routes import router as expense_router

app = FastAPI(title="Expense Tracker API")


@app.exception_handler(AuthFailure)
async def handle_auth_failure(_: Request, error: AuthFailure) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"code": error.code, "message": error.message},
    )


app.include_router(auth_router)
app.include_router(admin_router)
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

app.add_middleware(AgentAuthMiddleware)
