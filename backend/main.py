from fastapi import FastAPI

from app.routes import router as expense_router

app = FastAPI(title="Expense Tracker API")
app.include_router(expense_router)
