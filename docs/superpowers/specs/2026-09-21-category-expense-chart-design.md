# Category Expense Chart Design

## Goal

Show expense totals by category for a selected calendar month without loading individual expenses into the frontend.

## Backend API

Add `GET /expenses/by-category` with required `start_date` and `end_date` ISO date query parameters. Both bounds are inclusive. A reversed range returns HTTP 422.

The route calls the existing `services.get_spending_by_category` query. PostgreSQL filters by the current user, EUR currency, and date range, then groups by category and calculates `SUM(expenses.amount)`. Categories without expenses are omitted and results remain ordered by highest amount.

Response:

```json
{
  "currency": "EUR",
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "items": [
    {"category": "groceries", "amount": "120.50"},
    {"category": "transport", "amount": "45.00"}
  ]
}
```

Explicit Pydantic response models preserve decimal amounts as JSON strings. The endpoint continues using the repository's demo user until authentication is implemented.

## Frontend Data Flow

Add a same-origin Next.js route at `/api/expenses/by-category`. It derives the FastAPI origin from the existing server-only `BACKEND_AGENT_URL`, forwards validated date parameters, and preserves backend error status codes. Browser code does not receive the backend URL and no CORS change is needed.

`RevenueBreakdown` uses the existing `QueryClientProvider` and `useQuery`. Its query key includes the selected `YYYY-MM`, so TanStack Query caches each month independently. The query sends that month's first and last local calendar dates to the proxy and does not request individual expense rows.

## Month Filter and Chart

The selected value defaults to the browser's current local month. The existing shadcn `Select` lists the current month and previous 11 months, formatted with the active Vietnamese or English locale.

Replace the placeholder pie chart with the existing shadcn/Recharts bar-chart composition. Each API item becomes one bar using its category name and numeric amount. Currency labels and tooltips use `Intl.NumberFormat` with the API currency.

The card shows:

- a skeleton while the query loads;
- an inline retry action when the query fails;
- an empty message when the selected month has no expenses;
- the bar chart when data exists.

No export action, category selector, client-side aggregation, chart abstraction, or new dependency is added.

## Testing

Backend API coverage verifies multiple expenses in one category become one summed row, expenses outside the requested month are excluded, empty categories are omitted, foreign-user data is excluded, and reversed ranges return 422.

Frontend coverage isolates the date-range calculation and verifies the current/default month boundaries, including December and leap-year February. Existing backend Ruff/Pytest and frontend test/type checks run afterward; unrelated baseline failures are reported rather than hidden.
