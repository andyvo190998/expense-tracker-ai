import { Prisma } from "@prisma/client";
import { WorkDaysService } from "../src/work-days.service";

describe("WorkDaysService", () => {
	it("sets an eligible employee as the next turn", async () => {
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					roster: [
						{ employeeId: "one", position: 0, isAvailable: true },
						{ employeeId: "two", position: 1, isAvailable: true },
					],
				}),
				update: jest.fn().mockResolvedValue({ id: "day-id", nextPosition: 1 }),
			},
			serviceSession: { findMany: jest.fn().mockResolvedValue([]) },
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await (service as WorkDaysService & {
			setNext: (merchantId: string, dayId: string, employeeId: string) => Promise<unknown>;
		}).setNext("merchant-id", "day-id", "two");

		expect(transaction.workDay.update).toHaveBeenCalledWith({
			where: { id: "day-id" },
			data: { nextPosition: 1 },
		});
	});

	it("rejects setting a busy employee as the next turn", async () => {
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					roster: [{ employeeId: "one", position: 0, isAvailable: true }],
				}),
				update: jest.fn(),
			},
			serviceSession: { findMany: jest.fn().mockResolvedValue([{ employeeId: "one", status: "IN_PROGRESS", payments: [] }]) },
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(
			(service as WorkDaysService & {
				setNext: (merchantId: string, dayId: string, employeeId: string) => Promise<unknown>;
			}).setNext("merchant-id", "day-id", "one"),
		).rejects.toMatchObject({ response: { code: "NO_ELIGIBLE_EMPLOYEE" } });
	});

	it("rejects setting a higher-round employee as next", async () => {
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					roster: [
						{ employeeId: "anna", position: 0, isAvailable: true },
						{ employeeId: "bob", position: 1, isAvailable: true },
					],
				}),
				update: jest.fn(),
			},
			serviceSession: {
				findFirst: jest.fn().mockResolvedValue(null),
				findMany: jest.fn().mockResolvedValue([{ employeeId: "anna", status: "PAID", payments: [
					{ amount: new Prisma.Decimal("40.00"), currency: "EUR" },
				] }]),
			},
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(service.setNext("merchant-id", "day-id", "anna"))
			.rejects.toMatchObject({ response: { code: "EMPLOYEE_NOT_MINIMUM_ROUNDS" } });
		expect(transaction.workDay.update).not.toHaveBeenCalled();
	});

	it("reorders every paid customer for one employee", async () => {
		const rows = [
			{ id: "first-id", servedNumber: 1 },
			{ id: "second-id", servedNumber: 2 },
			{ id: "third-id", servedNumber: 3 },
		];
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: { findFirst: jest.fn().mockResolvedValue({ id: "day-id" }) },
			serviceSession: {
				findMany: jest.fn().mockResolvedValue(rows.map((row) => ({ ...row }))),
				aggregate: jest.fn().mockResolvedValue({ _max: { servedNumber: 3 } }),
				updateMany: jest.fn(({ where, data }) => {
					for (const row of rows) if (where.id.in.includes(row.id)) row.servedNumber += data.servedNumber.increment;
				}),
				update: jest.fn(({ where, data }) => {
					const row = rows.find((item) => item.id === where.id);
					if (row) row.servedNumber = data.servedNumber;
				}),
			},
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await service.reorderServedCustomers("merchant-id", "day-id", {
			employeeId: "employee-id",
			sessionIds: ["second-id", "third-id", "first-id"],
		});

		expect(rows).toEqual([
			{ id: "first-id", servedNumber: 3 },
			{ id: "second-id", servedNumber: 1 },
			{ id: "third-id", servedNumber: 2 },
		]);
	});

	it("rejects an incomplete served-customer order", async () => {
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: { findFirst: jest.fn().mockResolvedValue({ id: "day-id" }) },
			serviceSession: {
				findMany: jest.fn().mockResolvedValue([
					{ id: "first-id", servedNumber: 1 },
					{ id: "second-id", servedNumber: 2 },
				]),
			},
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(
			service.reorderServedCustomers("merchant-id", "day-id", {
				employeeId: "employee-id",
				sessionIds: ["first-id"],
			}),
		).rejects.toMatchObject({ response: { code: "INVALID_SERVED_ORDER" } });
	});

	it("creates a paid served customer at the employee's next number", async () => {
		const sessions: Array<Record<string, unknown>> = [
			{ employeeId: "employee-id", servedNumber: 2 },
		];
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					roster: [{ employeeId: "employee-id" }],
				}),
			},
			serviceSession: {
				aggregate: jest
					.fn()
					.mockResolvedValueOnce({ _max: { sequenceNumber: 8 } })
					.mockResolvedValueOnce({ _max: { servedNumber: 2 } }),
				create: jest.fn(({ data }) => {
					const session = { id: "new-session", ...data };
					sessions.push(session);
					return session;
				}),
			},
		};
		const db = {
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		};
		const service = new WorkDaysService(db as never);

		const created = await service.createServedCustomer("merchant-id", "day-id", {
			employeeId: "employee-id",
			customerName: "Mai",
			services: [
				{ serviceName: "Cut", amount: "20.00", currency: "EUR", method: "CASH" },
				{ serviceName: "Color", amount: "40.00", currency: "EUR", method: "PAYPAL" },
			],
		});

		expect(created).toMatchObject({
			merchantId: "merchant-id",
			workDayId: "day-id",
			employeeId: "employee-id",
			sequenceNumber: 9,
			servedNumber: 3,
			customerName: "Mai",
			status: "PAID",
			payments: {
				create: [
					{ merchantId: "merchant-id", serviceName: "Cut", amount: new Prisma.Decimal("20.00"), currency: "EUR", method: "CASH" },
					{ merchantId: "merchant-id", serviceName: "Color", amount: new Prisma.Decimal("40.00"), currency: "EUR", method: "PAYPAL" },
				],
			},
		});
	});

	it("rejects a served customer number that would leave a gap", async () => {
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					roster: [{ employeeId: "employee-id" }],
				}),
			},
			serviceSession: {
				aggregate: jest
					.fn()
					.mockResolvedValueOnce({ _max: { sequenceNumber: 8 } })
					.mockResolvedValueOnce({ _max: { servedNumber: 2 } }),
				create: jest.fn(),
			},
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(
			service.createServedCustomer("merchant-id", "day-id", {
				employeeId: "employee-id",
				servedNumber: 4,
				customerName: "Mai",
				services: [{ serviceName: "Cut", amount: "30.50", currency: "EUR", method: "CASH" }],
			}),
		).rejects.toMatchObject({ response: { code: "INVALID_SERVED_NUMBER" } });
	});

	it("swaps served numbers when an update targets an occupied number", async () => {
		const target = {
			id: "target-id",
			merchantId: "merchant-id",
			workDayId: "day-id",
			employeeId: "employee-id",
			servedNumber: 1,
			payments: [{ id: "payment-id", amount: new Prisma.Decimal("10.00"), method: "CASH" }],
		};
		const occupied = { id: "occupied-id", servedNumber: 2 };
		const transaction = {
			$queryRaw: jest.fn(),
			serviceSession: {
				aggregate: jest.fn().mockResolvedValue({ _max: { servedNumber: 2 } }),
				findFirst: jest
					.fn()
					.mockResolvedValueOnce(target)
					.mockResolvedValueOnce(occupied),
				update: jest.fn(({ where, data }) => {
					if (where.id === target.id) Object.assign(target, data);
					if (where.id === occupied.id) Object.assign(occupied, data);
					return where.id === target.id ? target : occupied;
				}),
			},
			payment: { deleteMany: jest.fn(), createMany: jest.fn() },
		};
		const db = {
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		};
		const service = new WorkDaysService(db as never);

		await service.updateServedCustomer("merchant-id", target.id, {
			servedNumber: 2,
			customerName: "Lan",
			services: [{ serviceName: "Color", amount: "12.00", currency: "EUR", method: "PAYPAL" }],
		});

		expect(target).toMatchObject({ servedNumber: 2, customerName: "Lan" });
		expect(occupied.servedNumber).toBe(1);
	});

	it("rejects moving a served customer beyond the employee's current count", async () => {
		const target = {
			id: "target-id",
			merchantId: "merchant-id",
			workDayId: "day-id",
			employeeId: "employee-id",
			servedNumber: 1,
			payments: [{ id: "payment-id", amount: new Prisma.Decimal("10.00"), method: "CASH" }],
		};
		const transaction = {
			$queryRaw: jest.fn(),
			serviceSession: {
				aggregate: jest.fn().mockResolvedValue({ _max: { servedNumber: 2 } }),
				findFirst: jest.fn().mockResolvedValueOnce(target),
				update: jest.fn(),
			},
			payment: { deleteMany: jest.fn(), createMany: jest.fn() },
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(
			service.updateServedCustomer("merchant-id", target.id, { servedNumber: 3 }),
		).rejects.toMatchObject({ response: { code: "INVALID_SERVED_NUMBER" } });
	});

	it("deletes a paid served customer owned by the merchant", async () => {
		const remaining = [{ servedNumber: 1 }, { servedNumber: 3 }, { servedNumber: 4 }];
		const transaction = {
			serviceSession: {
				aggregate: jest.fn().mockResolvedValue({ _max: { servedNumber: 4 } }),
				findFirst: jest.fn().mockResolvedValue({
					id: "session-id",
					merchantId: "merchant-id",
					workDayId: "day-id",
					employeeId: "employee-id",
					servedNumber: 2,
					status: "PAID",
				}),
				delete: jest.fn().mockResolvedValue({ id: "session-id" }),
				updateMany: jest.fn(({ where, data }) => {
					for (const row of remaining) {
						if (row.servedNumber > where.servedNumber.gt) {
							row.servedNumber += data.servedNumber.increment ?? -data.servedNumber.decrement;
						}
					}
					return { count: 2 };
				}),
			},
			payment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
		};
		const db = {
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		};
		const service = new WorkDaysService(db as never);

		await expect(
			service.deleteServedCustomer("merchant-id", "session-id"),
		).resolves.toEqual({ status: "deleted", id: "session-id" });
		expect(remaining.map((row) => row.servedNumber)).toEqual([1, 2, 3]);
	});

	it("finishes draft services and adds services entered during payment", async () => {
		const session = {
			id: "session-id",
			merchantId: "merchant-id",
			status: "IN_PROGRESS",
			completedAt: null as Date | null,
			payments: [{ id: "draft-id" }],
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
				update: jest.fn(),
				createMany: jest.fn(({ data }) => {
					payments.push(...data);
					return { count: data.length };
				}),
			},
		};
		const db = {
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		};
		const service = new WorkDaysService(db as never);

		await service.pay("merchant-id", "session-id", {
			services: [
				{ id: "draft-id", serviceName: "Cut", amount: "20.00", currency: "EUR", method: "CASH" },
				{ serviceName: "Color", amount: "40.00", currency: "EUR", method: "PAYPAL" },
			],
		});

		expect(transaction.payment.update).toHaveBeenCalledWith({
			where: { id: "draft-id" },
			data: { amount: new Prisma.Decimal("20.00"), currency: "EUR", method: "CASH" },
		});
		expect(payments).toEqual([
			expect.objectContaining({ merchantId: "merchant-id", serviceSessionId: "session-id", serviceName: "Color", amount: new Prisma.Decimal("40.00"), method: "PAYPAL" }),
		]);
		expect(session.status).toBe("PAID");
		expect(session.completedAt).toBeInstanceOf(Date);
	});

	it("assigns the lowest-round available employee", async () => {
		const create = jest.fn(({ data }) => ({ id: "new-session", ...data }));
		const transaction = {
			$queryRaw: jest.fn(),
			workDay: {
				findFirst: jest.fn().mockResolvedValue({
					id: "day-id",
					nextPosition: 0,
					roster: [
						{ employeeId: "anna", position: 0, isAvailable: true },
						{ employeeId: "bob", position: 1, isAvailable: true },
					],
				}),
				update: jest.fn(),
			},
			serviceSession: {
				findMany: jest.fn().mockResolvedValue([
					{ employeeId: "anna", status: "PAID", payments: [
						{ amount: new Prisma.Decimal("40.00"), currency: "EUR" },
						{ amount: new Prisma.Decimal("50.00"), currency: "EUR" },
					] },
				]),
				aggregate: jest.fn()
					.mockResolvedValueOnce({ _max: { sequenceNumber: 2 } })
					.mockResolvedValueOnce({ _max: { servedNumber: 0 } }),
				create,
				findUnique: jest.fn().mockResolvedValue({ id: "new-session", payments: [] }),
			},
			payment: { create: jest.fn() },
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await service.assign("merchant-id", "day-id", {});

		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ employeeId: "bob" }),
		}));
	});

	it("returns exact payment totals, customer counts, and qualifying rounds", async () => {
		const employee = { id: "employee-id", name: "Anna" };
		const day = {
			id: "day-id",
			nextPosition: 0,
			roster: [{ employee, employeeId: employee.id, position: 0, isAvailable: true }],
			sessions: [
				{
					employeeId: employee.id,
					status: "PAID",
					payments: [
						{ amount: new Prisma.Decimal("20.10"), currency: "EUR", method: "CASH" },
						{ amount: new Prisma.Decimal("40.00"), currency: "EUR", method: "PAYPAL" },
					],
				},
				{
					employeeId: employee.id,
					status: "PAID",
					payments: [{ amount: new Prisma.Decimal("30.00"), currency: "EUR", method: "CASH" }],
				},
			],
		};
		const db = { workDay: { findFirst: jest.fn().mockResolvedValue(day) } };
		const service = new WorkDaysService(db as never);

		const summary = await service.summary("merchant-id", day.id);

		expect(summary).toMatchObject({
			cashTotal: "50.10",
			paypalTotal: "40.00",
			total: "90.10",
			employees: [{ customersServed: 2, roundsEarned: 1, revenue: "90.10" }],
		});
	});

	it("does not mark a session paid when writing services fails", async () => {
		const update = jest.fn();
		const transaction = {
			$queryRaw: jest.fn(),
			serviceSession: {
				findFirst: jest.fn().mockResolvedValue({ id: "session-id", status: "IN_PROGRESS", payments: [] }),
				update,
			},
			payment: { createMany: jest.fn().mockRejectedValue(new Error("write failed")) },
		};
		const service = new WorkDaysService({
			$transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
		} as never);

		await expect(service.pay("merchant-id", "session-id", {
			services: [{ serviceName: "Cut", amount: "40.00", currency: "EUR", method: "CASH" }],
		})).rejects.toThrow("write failed");
		expect(update).not.toHaveBeenCalled();
	});
});
