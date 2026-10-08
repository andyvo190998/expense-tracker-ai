import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SessionStatus } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { AssignmentDto, AvailabilityDto, PaymentDto, StartWorkDayDto } from "./dtos";
import { selectNextEmployee } from "./work-days/turn-selection";

const dayInclude = {
	roster: { include: { employee: true }, orderBy: { position: "asc" as const } },
	sessions: {
		include: { employee: true, payments: true },
		orderBy: { sequenceNumber: "asc" as const },
	},
};

@Injectable()
export class WorkDaysService {
	constructor(private readonly db: PrismaService) {}
	current(merchantId: string) {
		return this.db.workDay.findFirst({
			where: { merchantId, status: "OPEN" },
			include: dayInclude,
		});
	}
	get(merchantId: string, id: string) {
		return this.requireDay(merchantId, id);
	}
	async start(merchantId: string, data: StartWorkDayDto) {
		if (
			!data.employees.length ||
			new Set(data.employees.map((item) => item.employeeId)).size !== data.employees.length
		)
			throw new ConflictException({ code: "INVALID_ROSTER" });
		const owned = await this.db.employee.count({
			where: {
				merchantId,
				isActive: true,
				id: { in: data.employees.map((item) => item.employeeId) },
			},
		});
		if (owned !== data.employees.length)
			throw new NotFoundException({ code: "EMPLOYEE_NOT_FOUND" });
		try {
			return await this.db.workDay.create({
				data: {
					merchantId,
					businessDate: new Date(`${data.businessDate}T00:00:00.000Z`),
					roster: {
						create: data.employees.map((item, position) => ({
							employeeId: item.employeeId,
							position,
							isAvailable: item.isAvailable,
							unavailableReason: item.isAvailable ? null : item.unavailableReason,
						})),
					},
				},
				include: dayInclude,
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
				throw new ConflictException({ code: "WORK_DAY_ALREADY_OPEN" });
			throw error;
		}
	}
	async availability(
		merchantId: string,
		dayId: string,
		employeeId: string,
		data: AvailabilityDto,
	) {
		await this.requireDay(merchantId, dayId);
		const entry = await this.db.workDayEmployee.findUnique({
			where: { workDayId_employeeId: { workDayId: dayId, employeeId } },
		});
		if (!entry) throw new NotFoundException({ code: "EMPLOYEE_NOT_FOUND" });
		return this.db.workDayEmployee.update({
			where: { workDayId_employeeId: { workDayId: dayId, employeeId } },
			data: {
				isAvailable: data.isAvailable,
				unavailableReason: data.isAvailable ? null : data.unavailableReason,
			},
		});
	}
	async assign(merchantId: string, dayId: string, data: AssignmentDto) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM work_days WHERE id = ${dayId}::uuid FOR UPDATE`;
			const day = await tx.workDay.findFirst({
				where: { id: dayId, merchantId, status: "OPEN" },
				include: { roster: true },
			});
			if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
			const busyRows = await tx.serviceSession.findMany({
				where: { workDayId: dayId, status: "IN_PROGRESS" },
				select: { employeeId: true },
			});
			const selected = selectNextEmployee(
				day.roster,
				day.nextPosition,
				new Set(busyRows.map((row) => row.employeeId)),
				data.employeeId,
			);
			if (!selected) throw new ConflictException({ code: "NO_ELIGIBLE_EMPLOYEE" });
			const sequenceNumber =
				(
					await tx.serviceSession.aggregate({
						where: { workDayId: dayId },
						_max: { sequenceNumber: true },
					})
				)._max.sequenceNumber ?? 0;
			const session = await tx.serviceSession.create({
				data: {
					merchantId,
					workDayId: dayId,
					employeeId: selected.employeeId,
					sequenceNumber: sequenceNumber + 1,
					customerName: data.customerName?.trim() || null,
				},
				include: { employee: true },
			});
			await tx.workDay.update({
				where: { id: dayId },
				data: { nextPosition: selected.nextPosition },
			});
			return session;
		});
	}
	async pay(merchantId: string, sessionId: string, data: PaymentDto) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM service_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
			const session = await tx.serviceSession.findFirst({
				where: { id: sessionId, merchantId },
			});
			if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
			if (session.status !== "IN_PROGRESS")
				throw new ConflictException({ code: "INVALID_SESSION_STATE" });
			const payment = await tx.payment.create({
				data: {
					merchantId,
					serviceSessionId: sessionId,
					amount: new Prisma.Decimal(data.amount),
					currency: data.currency,
					method: data.method,
				},
			});
			await tx.serviceSession.update({
				where: { id: sessionId },
				data: { status: "PAID", completedAt: new Date() },
			});
			return payment;
		});
	}
	async removeSession(merchantId: string, sessionId: string) {
		const result = await this.db.serviceSession.deleteMany({
			where: {
				id: sessionId,
				merchantId,
				status: "IN_PROGRESS",
			},
		});
		if (!result.count) throw new ConflictException({ code: "INVALID_SESSION_STATE" });
		return { status: "deleted", id: sessionId };
	}
	async close(merchantId: string, dayId: string) {
		await this.db.$transaction(async (tx) => {
			const day = await tx.workDay.findFirst({
				where: { id: dayId, merchantId, status: "OPEN" },
				include: { roster: { orderBy: { position: "asc" } } },
			});
			if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
			const active = await tx.serviceSession.count({
				where: {
					workDayId: dayId,
					merchantId,
					status: SessionStatus.IN_PROGRESS,
				},
			});
			if (active) throw new ConflictException({ code: "ACTIVE_SESSIONS_REMAIN" });
			await tx.workDay.update({
				where: { id: dayId },
				data: { status: "CLOSED", closedAt: new Date() },
			});
			const rotated = [...day.roster.slice(1), day.roster[0]];
			await Promise.all(
				rotated.map((entry, sortOrder) =>
					tx.employee.update({ where: { id: entry.employeeId }, data: { sortOrder } }),
				),
			);
		});
		return this.requireDay(merchantId, dayId);
	}
	async summary(merchantId: string, dayId: string) {
		const day = await this.requireDay(merchantId, dayId);
		const employees = day.roster.map(({ employee }) => {
			const sessions = day.sessions.filter(
				(session) => session.employeeId === employee.id && session.status === "PAID",
			);
			const revenue = sessions.reduce(
				(sum, session) => sum.plus(session.payments[0]?.amount ?? 0),
				new Prisma.Decimal(0),
			);
			return {
				employeeId: employee.id,
				name: employee.name,
				customersServed: sessions.length,
				revenue: revenue.toFixed(2),
			};
		});
		const paid = day.sessions.filter((session) => session.status === "PAID");
		const cashTotal = paid.reduce(
			(sum, session) =>
				session.payments[0]?.method === "CASH"
					? sum.plus(session.payments[0].amount)
					: sum,
			new Prisma.Decimal(0),
		);
		const paypalTotal = paid.reduce(
			(sum, session) =>
				session.payments[0]?.method === "PAYPAL"
					? sum.plus(session.payments[0].amount)
					: sum,
			new Prisma.Decimal(0),
		);
		return {
			workDayId: day.id,
			cashTotal: cashTotal.toFixed(2),
			paypalTotal: paypalTotal.toFixed(2),
			total: cashTotal.plus(paypalTotal).toFixed(2),
			currency: "EUR",
			employees,
			sessions: day.sessions,
		};
	}
	private async requireDay(merchantId: string, id: string) {
		const day = await this.db.workDay.findFirst({
			where: { id, merchantId },
			include: dayInclude,
		});
		if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
		return day;
	}
	private async requireSession(merchantId: string, id: string) {
		const session = await this.db.serviceSession.findFirst({
			where: { id, merchantId },
			include: { employee: true, payments: true },
		});
		if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
		return session;
	}
}
