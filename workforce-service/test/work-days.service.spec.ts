import { Prisma } from "@prisma/client";
import { WorkDaysService } from "../src/work-days.service";

describe("WorkDaysService", () => {
	it("keeps a service in progress until payment is recorded", async () => {
		const session = {
			id: "session-id",
			merchantId: "merchant-id",
			status: "IN_PROGRESS",
			completedAt: null as Date | null,
		};
		const payments: unknown[] = [];
		const transaction = {
			$queryRaw: jest.fn(),
			serviceSession: {
				findFirst: jest.fn().mockResolvedValue(session),
				update: jest.fn(({ data }) => {
					Object.assign(session, data);
					return session;
				}),
			},
			payment: {
				create: jest.fn(({ data }) => {
					const payment = { id: "payment-id", ...data };
					payments.push(payment);
					return payment;
				}),
			},
		};
		const db = {
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		};
		const service = new WorkDaysService(db as never);

		await service.pay("merchant-id", "session-id", {
			amount: "20.00",
			currency: "EUR",
			method: "CASH",
		});

		expect(payments).toHaveLength(1);
		expect(session.status).toBe("PAID");
		expect(session.completedAt).toBeInstanceOf(Date);
	});

	it("returns exact cash, PayPal, and combined workday totals", async () => {
		const employee = { id: "employee-id", name: "Anna" };
		const day = {
			id: "day-id",
			roster: [{ employee }],
			sessions: [
				{
					employeeId: employee.id,
					status: "PAID",
					payments: [{ amount: new Prisma.Decimal("20.10"), method: "CASH" }],
				},
				{
					employeeId: employee.id,
					status: "PAID",
					payments: [{ amount: new Prisma.Decimal("5.25"), method: "PAYPAL" }],
				},
			],
		};
		const db = { workDay: { findFirst: jest.fn().mockResolvedValue(day) } };
		const service = new WorkDaysService(db as never);

		const summary = await service.summary("merchant-id", day.id);

		expect(summary).toMatchObject({
			cashTotal: "20.10",
			paypalTotal: "5.25",
			total: "25.35",
		});
	});
});
