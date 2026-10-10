# Multi-Service Customer Rounds Design

## Goal

Allow one customer visit to contain multiple separately priced and paid services. Each service priced strictly above EUR 30.00 earns one employee round. Services priced at EUR 30.00 or less earn no rounds. Rotation must favor employees with fewer earned rounds while retaining the configured roster order as the tie-breaker.

Examples:

- EUR 20.00 + EUR 40.00: two services, EUR 60.00 revenue, one customer, one round.
- EUR 40.00 + EUR 50.00: two services, EUR 90.00 revenue, one customer, two rounds.
- EUR 30.00: one service, EUR 30.00 revenue, one customer, zero rounds.

This feature applies to the workforce service and the `chia-luot` dashboard. It does not change expense tracking or the AI expense agent.

## Domain Model

`ServiceSession` remains one customer visit assigned to one employee. Its related `Payment` rows become the service line items for that visit. This reuses the current persistence and response shape rather than introducing another table.

Each payment/service row contains:

- `serviceName`: required trimmed text, maximum 100 characters;
- `amount`: positive `Decimal(12,2)`;
- `currency`: `EUR` for this feature;
- `method`: `CASH` or `PAYPAL`.

The unique constraint on `Payment.serviceSessionId` is removed so a session can own multiple rows. The existing relationship changes from an optional single logical payment to a non-empty service collection when a session becomes paid.

The migration backfills every existing payment with `serviceName = "Service"`. It preserves payment IDs, amounts, methods, currencies, session ownership, and revenue history.

No persisted `roundCount` is added. The workforce service derives it with deterministic decimal comparisons:

```text
roundCount = count(service where currency == EUR and amount > 30.00)
```

The threshold is an application constant for the current EUR-only product. Merchant-specific thresholds and non-EUR conversion are outside this change.

## Rotation Logic

The authoritative round total for an employee is the number of qualifying service rows attached to that employee's paid sessions in the current workday. Customer count remains the number of paid sessions and revenue remains the sum of all service rows.

When choosing the next employee, the service:

1. excludes unavailable employees;
2. excludes employees with an `IN_PROGRESS` session;
3. calculates current-workday earned rounds for every remaining roster member;
4. finds the minimum round total;
5. considers only employees at that minimum;
6. selects the first candidate encountered from the existing rotation cursor, wrapping through fixed roster order.

The cursor advances to the roster position after the selected employee. It breaks ties only; it does not override the minimum-round rule.

A completed zero-round visit leaves that employee at the lower total, making them eligible again immediately when not busy. Other busy employees may still be served concurrently. Editing or deleting historical services changes the derived totals and therefore may change the next employee.

Example with roster `Anna -> Bob -> Carla`: after Anna earns two rounds while Bob and Carla have zero, the next qualifying one-round visits are assigned `Bob -> Carla -> Bob -> Carla -> Anna`.

Manual assignment to a named employee remains allowed. It records the resulting service rounds normally; subsequent automatic selection uses the recalculated totals.

## API Contracts

The service-line input is:

```json
{
  "serviceName": "Color",
  "amount": "40.00",
  "currency": "EUR",
  "method": "PAYPAL"
}
```

`currency` may continue to default to `EUR` at the DTO boundary. Amounts retain the existing decimal-string validation and must be positive.

Completing an in-progress session accepts:

```json
{
  "services": [
    {"serviceName": "Haircut", "amount": "20.00", "currency": "EUR", "method": "CASH"},
    {"serviceName": "Color", "amount": "40.00", "currency": "EUR", "method": "PAYPAL"}
  ]
}
```

Creating a historical served customer accepts `employeeId`, optional `servedNumber`, optional `customerName`, and the same non-empty `services` array.

Updating a served customer accepts optional `servedNumber`, optional `customerName`, and an optional non-empty `services` array. When `services` is supplied, it replaces the complete existing service collection in the same database transaction. This is the smallest update contract and avoids per-row synchronization semantics that the UI does not need.

Session responses continue returning `payments`, with each row now also containing `serviceName`. Summary responses add `roundsEarned` per employee while retaining `customersServed` and revenue fields. Current-workday responses add the backend-derived `nextEmployeeId` so the frontend does not duplicate the fairness algorithm.

For a completed visit, the backend response exposes derived values:

```json
{
  "customerCount": 1,
  "roundCount": 1,
  "total": "60.00"
}
```

All endpoints remain authenticated, CSRF-protected where applicable, merchant-scoped, and transactional. Round counts supplied by clients are ignored because the backend derives them.

## Validation and Errors

- A paid/completed session must have at least one service.
- Every service needs a non-empty name, valid positive decimal amount, EUR currency, and supported method.
- EUR 30.00 earns zero rounds; EUR 30.01 earns one.
- A failure writing any service rolls back the entire completion or update.
- Existing not-found, invalid-session-state, served-number conflict, and merchant-isolation behavior remains unchanged.
- The frontend displays the structured backend error and must not show a success toast after a failed mutation.

## User Interface

### Finish Customer

The current single amount and method dialog becomes a service editor. It starts with one row and provides:

- service name input;
- amount input;
- independent payment-method selector;
- remove action when more than one row exists;
- `Add service` action.

The form derives and displays the combined total and preview round count. It includes the concise rule `EUR 30.00 or less = 0 rounds; over EUR 30.00 = 1 round`. Completion is disabled until every row is valid.

### Employee Cards

Each employee card displays separate current-workday values:

- Customers: paid customer sessions;
- Rounds: qualifying service count used for rotation;
- Earned: sum of all service amounts.

The next-turn marker uses the workday response's `nextEmployeeId` after completion or historical edits rather than a frontend approximation.

### Served-Customer History

The employee history table shows customer name, combined visit total, and earned rounds. Opening a visit lists every service with its price and payment method. Editing uses the same service editor and replaces the visit's service collection. Deleting continues to remove the entire visit after confirmation.

## Compatibility and Rollout

The schema migration and all workforce-service/frontend callers ship together because the completion, historical-create, and historical-update payloads change from singular `amount`/`method` fields to `services`.

Existing records remain visible with one generic service line and unchanged revenue. There is no compatibility adapter for old write payloads because the only current caller is the same repository frontend.

## Testing

Backend tests cover:

- migration preservation of existing payment data;
- boundary calculations for EUR 30.00 and EUR 30.01;
- mixed and multiple qualifying services;
- zero-round eligibility;
- the `Bob -> Carla -> Bob -> Carla -> Anna` fairness sequence;
- tie-breaking, busy employees, unavailable employees, and manual assignment;
- atomic multi-service completion and replacement updates;
- recalculation after update and deletion;
- validation and merchant isolation;
- customer count, round count, and revenue summaries.

Frontend tests cover:

- adding and removing service rows;
- independent service payment methods;
- total and round previews;
- invalid-row blocking;
- completion payload shape;
- customer details and replacement editing;
- separate Customers, Rounds, and Earned metrics.

Verification runs the workforce-service test, lint, and build commands plus the frontend test, lint, and type-check commands. Existing unrelated lint failures, if any, are reported separately rather than attributed to this feature.

## Non-Goals

- merchant-configurable thresholds;
- multiple currencies or currency conversion;
- a reusable service catalog or preset pricing;
- discounts, tax, tips, refunds, or split tender within one service line;
- per-service employees within one customer visit;
- preserving compatibility for external clients that send the old singular payment payload.
