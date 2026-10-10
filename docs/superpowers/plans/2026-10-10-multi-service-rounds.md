# Multi-Service Customer Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple independently paid services per customer and select the next employee by the fewest services priced strictly above EUR 30.00.

**Architecture:** Keep one `ServiceSession` per customer and reuse its `Payment[]` relationship as service lines by adding `serviceName` and removing the one-payment unique constraint. Derive round counts in backend code/queries, use minimum-round scheduling with the existing cursor as a tie-breaker, and expose `nextEmployeeId` so React renders authoritative backend state.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Jest, Next.js 16, React 19, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-multi-service-rounds-design.md`

## Global Constraints

- A service earns one round only when its EUR amount is strictly greater than `30.00`.
- EUR `30.00` and lower earn zero rounds; no floating-point money arithmetic.
- Customer count is paid sessions, round count is qualifying service rows, and revenue is all service rows.
- The backend derives totals, rounds, and next employee; clients cannot submit authoritative round counts.
- All writes remain merchant-scoped and transactional.
- Existing payments are preserved and backfilled with `serviceName = "Service"`.
- Do not add dependencies, configurable thresholds, currency conversion, service catalogs, discounts, tax, tips, refunds, or per-service employees.
- Do not create commits; the user explicitly requested uncommitted implementation.

## Review Focus

- Exactly `30.00` must not earn a round while `30.01` does.
- Empty, partially valid, or duplicate-looking service rows must either validate as independent rows or reject atomically without partial persistence.
- Busy/unavailable employees must be skipped without changing their earned totals or breaking cursor tie order.
- Replacing or deleting historical services must immediately affect summaries and next-employee selection.
- Mixed cash/PayPal services in one visit must contribute correctly to each payment-method total and the combined total.

## File Map

- `workforce-service/prisma/schema.prisma` — allow multiple payments per session and add service names.
- `workforce-service/prisma/migrations/20261010000000_add_multi_service_payments/migration.sql` — preserve/backfill existing rows and remove uniqueness.
- `workforce-service/src/dtos.ts` — validate service arrays for completion and historical mutations.
- `workforce-service/src/work-days/turn-selection.ts` — pure minimum-round scheduling and round threshold helper.
- `workforce-service/test/dtos.spec.ts` — nested service-array validation.
- `workforce-service/src/work-days.service.ts` — transactional service writes, derived summaries, and authoritative next employee.
- `workforce-service/test/turn-selection.spec.ts` — boundary and fairness sequence tests.
- `workforce-service/test/work-days.service.spec.ts` — persistence, totals, recalculation, and rollback-facing service tests.
- `frontend/src/app/(dashboard)/chia-luot/workforce.ts` — multi-service API types and backend next-employee field.
- `frontend/src/app/(dashboard)/chia-luot/workforce.test.tsx` — remove obsolete client-side next-turn tests.
- `frontend/src/app/(dashboard)/chia-luot/components/service-editor.tsx` — shared service-row editor and deterministic preview.
- `frontend/src/app/(dashboard)/chia-luot/components/service-editor.test.tsx` — row, validation, total, and round-preview behavior.
- `frontend/src/app/(dashboard)/chia-luot/components/workday-components.tsx` — finish dialog and employee round metric.
- `frontend/src/app/(dashboard)/chia-luot/components/workday-components.test.tsx` — completion and card rendering behavior.
- `frontend/src/app/(dashboard)/chia-luot/components/served-customers-dialog.tsx` — multi-service history display/edit/create.
- `frontend/src/app/(dashboard)/chia-luot/components/served-customers-dialog.test.tsx` — history payload and rendering behavior.
- `frontend/src/app/(dashboard)/chia-luot/page.tsx` — send service arrays and consume backend-selected next employee.
- `docs/PRODUCT_SPEC.md` — record the approved workforce business rule.

---

### Task 1: Persist Multiple Named Services

**Interfaces:**
- Produces: `ServiceInputDto { serviceName: string; amount: string; currency: string; method: PaymentMethod }` and mutation DTO property `services: ServiceInputDto[]`.
- Produces: Prisma `Payment.serviceName: string` and a non-unique `Payment.serviceSessionId` relation.

- [ ] **Step 1: Add failing DTO validation tests**

Add Jest cases in `workforce-service/test/dtos.spec.ts` using `plainToInstance` and `validate` that prove a valid two-service `PaymentDto` passes, an empty array fails, a blank service name fails, and one malformed amount makes the complete payload fail. Use literal inputs including `30.00`, `30.01`, `CASH`, and `PAYPAL`.

- [ ] **Step 2: Run the DTO tests and verify RED**

Run: `cd workforce-service && pnpm jest test/dtos.spec.ts --runInBand`

Expected: FAIL because `PaymentDto.services` and `ServiceInputDto` do not exist.

- [ ] **Step 3: Implement nested DTO validation**

In `src/dtos.ts`, add:

```ts
export class ServiceInputDto {
  @IsString() @IsNotEmpty() @MaxLength(100) serviceName!: string;
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) amount!: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency = "EUR";
  @IsEnum(PaymentMethod) method!: PaymentMethod;
}

export class PaymentDto {
  @IsArray() @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ServiceInputDto)
  services!: ServiceInputDto[];
}
```

Keep `CreateServedCustomerDto extends PaymentDto`; change `UpdateServedCustomerDto` to an optional validated `services` array and remove its singular `amount`/`method` properties.

- [ ] **Step 4: Change schema and add the preserving migration**

Change `Payment` to include `serviceName String @map("service_name")` and change `serviceSessionId String @map("service_session_id") @db.Uuid` by removing `@unique`. Add an ordinary index on `serviceSessionId`.

Create the migration SQL:

```sql
ALTER TABLE "payments" ADD COLUMN "service_name" TEXT;
UPDATE "payments" SET "service_name" = 'Service';
ALTER TABLE "payments" ALTER COLUMN "service_name" SET NOT NULL;
DROP INDEX "payments_service_session_id_key";
CREATE INDEX "payments_service_session_id_idx" ON "payments"("service_session_id");
```

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run: `cd workforce-service && pnpm prisma:generate && pnpm jest test/dtos.spec.ts --runInBand`

Expected: Prisma generation succeeds and DTO tests pass.

### Task 2: Implement Deterministic Round-Aware Selection

**Interfaces:**
- Consumes: roster entries and per-employee round totals calculated by the service.
- Produces: `roundsForServices(services: { amount: Prisma.Decimal | string; currency: string }[]): number`.
- Produces: `selectNextEmployee(roster, nextPosition, busy, roundsByEmployee, employeeId?)` returning `{ employeeId, nextPosition } | null`.

- [ ] **Step 1: Add failing calculation and scheduling tests**

Extend `test/turn-selection.spec.ts` with literal assertions:

```ts
expect(roundsForServices([{ amount: "30.00", currency: "EUR" }])).toBe(0);
expect(roundsForServices([{ amount: "30.01", currency: "EUR" }])).toBe(1);
expect(roundsForServices([
  { amount: "20.00", currency: "EUR" },
  { amount: "40.00", currency: "EUR" },
])).toBe(1);
```

Add a sequence test starting with `{ anna: 2, bob: 0, carla: 0 }`. After each chosen employee, increment that employee's test total and pass the returned cursor back. Assert `bob, carla, bob, carla, anna`. Keep cases proving busy and unavailable minimum-round employees are skipped and a manual employee remains selectable.

- [ ] **Step 2: Run selection tests and verify RED**

Run: `cd workforce-service && pnpm jest test/turn-selection.spec.ts --runInBand`

Expected: FAIL because the helper and round-aware argument do not exist.

- [ ] **Step 3: Implement the minimal pure algorithm**

Use `Prisma.Decimal` comparisons for `roundsForServices`. In automatic selection, sort by roster position, filter available/not-busy entries, find the minimum from `roundsByEmployee.get(id) ?? 0`, then scan from `nextPosition` for the first eligible entry at that minimum. Preserve the current manual-selection rule and cursor behavior.

- [ ] **Step 4: Run selection tests and verify GREEN**

Run: `cd workforce-service && pnpm jest test/turn-selection.spec.ts --runInBand`

Expected: all selection and threshold tests pass.

### Task 3: Store Service Arrays and Return Authoritative Workforce State

**Interfaces:**
- Consumes: `PaymentDto.services`, `UpdateServedCustomerDto.services`, `roundsForServices`, and round-aware `selectNextEmployee`.
- Produces: session `payments[]` containing `serviceName` and summary employees containing `roundsEarned`.
- Produces: current/get/start workday results containing `nextEmployeeId: string | null`.

- [ ] **Step 1: Add failing service tests**

Extend `test/work-days.service.spec.ts` with transaction fakes that assert:

- `pay` calls `payment.createMany` with two merchant/session-scoped rows, then marks the session paid;
- historical create nests two payment rows;
- historical update deletes old rows and creates the complete replacement inside the transaction;
- summary adds every payment to revenue, separates cash and PayPal across all rows, counts sessions as customers, and counts only amounts over `30.00` as rounds;
- deletion changes derived selection because no persisted round total is used;
- assignment passes a complete `roundsByEmployee` map to the selector and skips busy employees;
- a service write rejection prevents the session status update.

- [ ] **Step 2: Run service tests and verify RED**

Run: `cd workforce-service && pnpm jest test/work-days.service.spec.ts --runInBand`

Expected: FAIL on singular payment writes and first-payment-only summaries.

- [ ] **Step 3: Implement transactional service collections**

Map every DTO service to `{ merchantId, serviceSessionId, serviceName: serviceName.trim(), amount: new Prisma.Decimal(amount), currency, method }`. Use `createMany` for completion. Use nested `create` for historical creation. For replacement update, call `deleteMany` then `createMany` before updating the session. Keep all operations inside the existing transaction callbacks.

- [ ] **Step 4: Implement aggregate summaries and round-aware assignment**

Flatten every paid session's `payments` when calculating revenue, cash, PayPal, and `roundsEarned`. Before automatic assignment, query paid sessions for the day with their payment amounts, build a map initialized to zero for every roster member, and pass it to `selectNextEmployee`.

Add one private response mapper or equivalent small helper that attaches the selected eligible `nextEmployeeId` to workday reads. Reuse the same selector and derived totals; do not duplicate the algorithm in controllers or frontend code.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run: `cd workforce-service && pnpm test`

Expected: all Jest suites pass.

### Task 4: Build the Shared Service Editor

**Interfaces:**
- Produces: frontend `ServiceInput { serviceName: string; amount: string; currency: "EUR"; method: PaymentMethod }`.
- Produces: `ServiceEditor({ services, onChange })` with Add/Remove controls and visible total/round preview.
- Produces: `serviceTotals(services): { total: string; rounds: number; valid: boolean }` using decimal-string-to-cents parsing, not floating point.

- [ ] **Step 1: Add failing editor tests**

Create `components/service-editor.test.tsx`. Prove that adding a second row, entering Haircut `20.00` Cash and Color `40.00` PayPal displays `€60.00` and `1 round`; removing a row updates both values; `30.00` shows zero and `30.01` shows one; blank names, zero amounts, and malformed amounts report invalid state.

- [ ] **Step 2: Run editor tests and verify RED**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/service-editor.test.tsx'`

Expected: FAIL because the editor module does not exist.

- [ ] **Step 3: Implement the editor and integer-cent preview**

Create `service-editor.tsx`. Parse validated decimal strings into integer cents by splitting on `.` and padding the fraction to two digits. Sum cents and count rows with cents greater than `3000`. Render accessible labels containing each one-based row number. Keep at least one row and disable its remove action when it is the only row.

- [ ] **Step 4: Run editor tests and verify GREEN**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/service-editor.test.tsx'`

Expected: all editor tests pass.

### Task 5: Integrate Multi-Service Completion and Employee Metrics

**Interfaces:**
- Consumes: `ServiceEditor`, `ServiceInput`, summary `roundsEarned`, and workday `nextEmployeeId`.
- Produces: completion callback `onPay(services: ServiceInput[])` and cards showing Customers, Rounds, and Earned.

- [ ] **Step 1: Add failing completion/card tests**

Update `components/workday-components.test.tsx` to complete a customer with two service rows and assert the real component callback receives both independent methods. Assert completion is disabled for an invalid row. Render an employee card with `{ customersServed: 1, roundsEarned: 2, revenue: "90.00" }` and assert all three labels/values appear.

- [ ] **Step 2: Run component tests and verify RED**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/workday-components.test.tsx'`

Expected: FAIL because `PaymentDialog` still accepts one amount and method and cards omit rounds.

- [ ] **Step 3: Replace the finish form and render rounds**

Replace `amount`/`method` props and local page state with `services`. Initialize one empty EUR/Cash row whenever finishing starts. Render `ServiceEditor`, pass its validity to the finish button, and display `roundsEarned` beside customer count and revenue.

- [ ] **Step 4: Use backend next employee in the page**

Add `nextEmployeeId` to `WorkDay`, delete the frontend `nextEmployeeId(...)` helper and its obsolete tests, remove the page's client-side calculation, and set `isNext={entry.employeeId === day.nextEmployeeId}`. Submit `{ services }` to `sessions/:id/payments`. Retain TanStack Query invalidation so completion fetches the new authoritative state.

- [ ] **Step 5: Run completion/card tests and verify GREEN**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/workday-components.test.tsx'`

Expected: all component tests pass.

### Task 6: Integrate Multi-Service History Create/Edit/Display

**Interfaces:**
- Consumes: shared `ServiceInput`, `ServiceEditor`, and sessions with multiple named payments.
- Produces: `ServedCustomerInput { servedNumber: number; customerName: string; services: ServiceInput[] }`.

- [ ] **Step 1: Rewrite history tests to fail on the old form**

Update `served-customers-dialog.test.tsx` fixtures to include complete payment objects with `serviceName`. Assert a visit row renders combined total and round count; its details list both services/methods; create and edit callbacks receive a complete `services` array; failed mutations keep every entered row; deletion and reordering still work.

- [ ] **Step 2: Run history tests and verify RED**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/served-customers-dialog.test.tsx'`

Expected: FAIL because the dialog reads only `payments[0]` and emits singular amount/method fields.

- [ ] **Step 3: Reuse the service editor in create/edit dialogs**

Change `ServedCustomerInput` to hold `services`. For the table, derive a visit total from all rows and count qualifying rows. In details, render every service name, formatted amount, and method. Seed editing with every existing payment row and send complete replacement arrays.

- [ ] **Step 4: Update page mutation payloads and frontend types**

Change `Session.payments` to include `id`, `serviceName`, `amount`, `currency`, and `method`. Pass historical create/update inputs unchanged except for the existing `employeeId` and `currency` behavior; currency now lives on each service row.

- [ ] **Step 5: Run history tests and verify GREEN**

Run: `cd frontend && pnpm vitest run 'src/app/(dashboard)/chia-luot/components/served-customers-dialog.test.tsx'`

Expected: all history tests pass.

### Task 7: Update Product Documentation and Verify the Whole Change

**Interfaces:**
- Consumes: all backend and frontend behavior from Tasks 1-6.
- Produces: documented product rule and verified uncommitted working tree.

- [ ] **Step 1: Update product behavior**

Add a concise workforce section to `docs/PRODUCT_SPEC.md` stating: one customer can contain multiple independently paid services; each EUR service strictly above `30.00` earns one round; selection favors the lowest round total and uses roster order/cursor for ties; zero-round employees remain eligible.

- [ ] **Step 2: Run backend verification**

Run:

```bash
cd workforce-service
pnpm prisma:generate
pnpm test
pnpm lint
pnpm build
```

Expected: all commands exit zero.

- [ ] **Step 3: Run frontend verification**

Run:

```bash
cd frontend
pnpm test
pnpm typecheck
pnpm eslint 'src/app/(dashboard)/chia-luot/**/*.{ts,tsx}'
```

Expected: all scoped commands exit zero. Also run `pnpm lint`; report the known unrelated existing lint errors separately if they remain.

- [ ] **Step 4: Validate migration SQL when PostgreSQL is available**

Run `docker compose config`, start the repository PostgreSQL/workforce service using the existing compose commands, apply Prisma migrations, and verify an existing payment retains its amount/method and gains `service_name = 'Service'`. If Docker or the database is unavailable, report this check as blocked rather than claiming it passed.

- [ ] **Step 5: Review the final diff without committing**

Run `git diff --check`, inspect `git status --short`, and confirm only the planned feature files plus the pre-existing employee-management changes are modified. Do not run `git commit`.
