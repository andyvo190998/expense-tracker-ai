import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SessionStatus } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import {
	AssignmentDto,
	AvailabilityDto,
	CreateServedCustomerDto,
	DraftServiceDto,
	PaymentDto,
	ReorderServedCustomersDto,
	StartWorkDayDto,
	UpdateServedCustomerDto,
} from "./dtos";
import { roundsForServices, selectNextEmployee } from "./work-days/turn-selection";

const dayInclude = {
	roster: { include: { employee: true }, orderBy: { position: "asc" as const } },
	sessions: {
		include: { employee: true, payments: true },
		orderBy: { sequenceNumber: "asc" as const },
	},
};
type DayWithDetails = Prisma.WorkDayGetPayload<{ include: typeof dayInclude }>;

@Injectable()
export class WorkDaysService {
	constructor(private readonly db: PrismaService) {}
	async current(merchantId: string) {
		const day = await this.db.workDay.findFirst({
			where: { merchantId, status: "OPEN" },
			include: dayInclude,
		});
		return day ? this.withNextEmployee(day) : null;
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
			const day = await this.db.workDay.create({
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
			return this.withNextEmployee(day);
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
	async setNext(merchantId: string, dayId: string, employeeId: string) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM work_days WHERE id = ${dayId}::uuid FOR UPDATE`;
			const day = await tx.workDay.findFirst({
				where: { id: dayId, merchantId, status: "OPEN" },
				include: { roster: true },
			});
			if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
			const entry = day.roster.find((item) => item.employeeId === employeeId);
			if (!entry) throw new NotFoundException({ code: "EMPLOYEE_NOT_FOUND" });
			const sessions = await tx.serviceSession.findMany({
				where: { workDayId: dayId },
				include: { payments: true },
			});
			const busy = new Set(
				sessions.filter((session) => session.status === "IN_PROGRESS").map((session) => session.employeeId),
			);
			if (!entry.isAvailable || busy.has(employeeId))
				throw new ConflictException({ code: "NO_ELIGIBLE_EMPLOYEE" });
			const selected = selectNextEmployee(
				day.roster,
				entry.position,
				busy,
				this.roundsByEmployee(day.roster, sessions),
			);
			if (selected?.employeeId !== employeeId)
				throw new ConflictException({ code: "EMPLOYEE_NOT_MINIMUM_ROUNDS" });
			return tx.workDay.update({
				where: { id: dayId },
				data: { nextPosition: entry.position },
			});
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
			const sessions = await tx.serviceSession.findMany({
				where: { workDayId: dayId },
				include: { payments: true },
			});
			const busy = new Set(
				sessions.filter((session) => session.status === "IN_PROGRESS").map((session) => session.employeeId),
			);
			const rounds = this.roundsByEmployee(day.roster, sessions);
			const selected = selectNextEmployee(
				day.roster,
				day.nextPosition,
				busy,
				rounds,
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
			const servedNumber =
				(
					await tx.serviceSession.aggregate({
						where: { workDayId: dayId, employeeId: selected.employeeId },
						_max: { servedNumber: true },
					})
				)._max.servedNumber ?? 0;
			const session = await tx.serviceSession.create({
				data: {
					merchantId,
					workDayId: dayId,
					employeeId: selected.employeeId,
					sequenceNumber: sequenceNumber + 1,
					servedNumber: servedNumber + 1,
					customerName: data.customerName?.trim() || null,
				},
				include: { employee: true, payments: true },
			});
			await tx.payment.create({
				data: {
					merchantId,
					serviceSessionId: session.id,
					serviceName: "",
					amount: null,
					method: null,
				},
			});
			await tx.workDay.update({
				where: { id: dayId },
				data: { nextPosition: selected.nextPosition },
			});
			return tx.serviceSession.findUnique({
				where: { id: session.id },
				include: { employee: true, payments: true },
			});
		});
	}
	async addService(merchantId: string, sessionId: string, data: DraftServiceDto) {
		await this.requireInProgressSession(merchantId, sessionId);
		return this.db.payment.create({
			data: {
				merchantId,
				serviceSessionId: sessionId,
				serviceName: data.serviceName.trim(),
				amount: null,
				method: null,
			},
		});
	}
	async updateService(merchantId: string, sessionId: string, serviceId: string, data: DraftServiceDto) {
		await this.requireInProgressSession(merchantId, sessionId);
		const updated = await this.db.payment.updateMany({
			where: { id: serviceId, serviceSessionId: sessionId, merchantId },
			data: { serviceName: data.serviceName.trim() },
		});
		if (!updated.count) throw new NotFoundException({ code: "SERVICE_NOT_FOUND" });
		return this.db.payment.findUnique({ where: { id: serviceId } });
	}
	async deleteService(merchantId: string, sessionId: string, serviceId: string) {
		await this.requireInProgressSession(merchantId, sessionId);
		const services = await this.db.payment.findMany({
			where: { serviceSessionId: sessionId, merchantId },
			select: { id: true },
		});
		if (!services.some((service) => service.id === serviceId))
			throw new NotFoundException({ code: "SERVICE_NOT_FOUND" });
		if (services.length === 1) throw new ConflictException({ code: "SERVICE_REQUIRED" });
		await this.db.payment.delete({ where: { id: serviceId } });
		return { status: "deleted", id: serviceId };
	}
	async createServedCustomer(
		merchantId: string,
		dayId: string,
		data: CreateServedCustomerDto,
	) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM work_days WHERE id = ${dayId}::uuid FOR UPDATE`;
			const day = await tx.workDay.findFirst({
				where: { id: dayId, merchantId, status: "OPEN" },
				include: { roster: true },
			});
			if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
			if (!day.roster.some((entry) => entry.employeeId === data.employeeId))
				throw new NotFoundException({ code: "EMPLOYEE_NOT_FOUND" });
			const sequenceNumber =
				(
					await tx.serviceSession.aggregate({
						where: { workDayId: dayId },
						_max: { sequenceNumber: true },
					})
				)._max.sequenceNumber ?? 0;
			const maxServedNumber =
				(
					await tx.serviceSession.aggregate({
						where: { workDayId: dayId, employeeId: data.employeeId },
						_max: { servedNumber: true },
					})
				)._max.servedNumber ?? 0;
			if (data.servedNumber && data.servedNumber > maxServedNumber + 1)
				throw new ConflictException({ code: "INVALID_SERVED_NUMBER" });
			try {
				return await tx.serviceSession.create({
					data: {
						merchantId,
						workDayId: dayId,
						employeeId: data.employeeId,
						sequenceNumber: sequenceNumber + 1,
						servedNumber: data.servedNumber ?? maxServedNumber + 1,
						customerName: data.customerName?.trim() || null,
						status: "PAID",
						completedAt: new Date(),
						payments: { create: data.services.map((service) => ({
							merchantId,
							serviceName: service.serviceName.trim(),
							amount: new Prisma.Decimal(service.amount),
							currency: service.currency,
							method: service.method,
						})) },
					},
					include: { employee: true, payments: true },
				});
			} catch (error) {
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
					throw new ConflictException({ code: "SERVED_NUMBER_TAKEN" });
				throw error;
			}
		});
	}
	async reorderServedCustomers(
		merchantId: string,
		dayId: string,
		data: ReorderServedCustomersDto,
	) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM work_days WHERE id = ${dayId}::uuid FOR UPDATE`;
			const day = await tx.workDay.findFirst({ where: { id: dayId, merchantId } });
			if (!day) throw new NotFoundException({ code: "WORK_DAY_NOT_FOUND" });
			const rows = await tx.serviceSession.findMany({
				where: {
					merchantId,
					workDayId: dayId,
					employeeId: data.employeeId,
					status: "PAID",
				},
				select: { id: true, servedNumber: true },
				orderBy: { servedNumber: "asc" },
			});
			const requestedIds = new Set(data.sessionIds);
			if (
				requestedIds.size !== rows.length ||
				data.sessionIds.length !== rows.length ||
				rows.some((row) => !requestedIds.has(row.id))
			)
				throw new ConflictException({ code: "INVALID_SERVED_ORDER" });
			const maximum = await tx.serviceSession.aggregate({
				where: { workDayId: dayId, employeeId: data.employeeId },
				_max: { servedNumber: true },
			});
			const offset = (maximum._max.servedNumber ?? 0) + rows.length + 1;
			await tx.serviceSession.updateMany({
				where: { id: { in: data.sessionIds }, merchantId },
				data: { servedNumber: { increment: offset } },
			});
			await Promise.all(
				data.sessionIds.map((id, index) =>
					tx.serviceSession.update({
						where: { id },
						data: { servedNumber: index + 1 },
					}),
				),
			);
			return tx.serviceSession.findMany({
				where: { id: { in: data.sessionIds }, merchantId },
				include: { employee: true, payments: true },
				orderBy: { servedNumber: "asc" },
			});
		});
	}
	async updateServedCustomer(
		merchantId: string,
		sessionId: string,
		data: UpdateServedCustomerDto,
	) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM service_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
			const session = await tx.serviceSession.findFirst({
				where: { id: sessionId, merchantId, status: "PAID" },
				include: { payments: true },
			});
			if (!session) throw new NotFoundException({ code: "SERVED_CUSTOMER_NOT_FOUND" });
			if (data.servedNumber && data.servedNumber !== session.servedNumber) {
				const previousNumber = session.servedNumber;
				const maximum = await tx.serviceSession.aggregate({
					where: {
						workDayId: session.workDayId,
						employeeId: session.employeeId,
					},
					_max: { servedNumber: true },
				});
				if (data.servedNumber > (maximum._max.servedNumber ?? 0))
					throw new ConflictException({ code: "INVALID_SERVED_NUMBER" });
				const occupied = await tx.serviceSession.findFirst({
					where: {
						workDayId: session.workDayId,
						employeeId: session.employeeId,
						servedNumber: data.servedNumber,
					},
				});
				if (occupied) {
					const temporaryNumber = (maximum._max.servedNumber ?? 0) + 1;
					await tx.serviceSession.update({
						where: { id: session.id },
						data: { servedNumber: temporaryNumber },
					});
					await tx.serviceSession.update({
						where: { id: occupied.id },
						data: { servedNumber: previousNumber },
					});
				}
			}
			if (data.services) {
				await tx.payment.deleteMany({ where: { serviceSessionId: session.id, merchantId } });
				await tx.payment.createMany({
					data: data.services.map((service) => this.paymentData(merchantId, session.id, service)),
				});
			}
			const updated = await tx.serviceSession.update({
				where: { id: session.id },
				data: {
					servedNumber: data.servedNumber,
					customerName:
						data.customerName === undefined ? undefined : data.customerName.trim() || null,
				},
				include: { employee: true, payments: true },
			});
			return updated;
		});
	}
	async deleteServedCustomer(merchantId: string, sessionId: string) {
		return this.db.$transaction(async (tx) => {
			const session = await tx.serviceSession.findFirst({
				where: { id: sessionId, merchantId, status: "PAID" },
			});
			if (!session) throw new NotFoundException({ code: "SERVED_CUSTOMER_NOT_FOUND" });
			await tx.payment.deleteMany({ where: { serviceSessionId: sessionId, merchantId } });
			await tx.serviceSession.delete({ where: { id: sessionId } });
			const maximum = await tx.serviceSession.aggregate({
				where: { workDayId: session.workDayId, employeeId: session.employeeId },
				_max: { servedNumber: true },
			});
			const offset = (maximum._max.servedNumber ?? 0) + 1;
			await tx.serviceSession.updateMany({
				where: {
					workDayId: session.workDayId,
					employeeId: session.employeeId,
					servedNumber: { gt: session.servedNumber },
				},
				data: { servedNumber: { increment: offset } },
			});
			await tx.serviceSession.updateMany({
				where: {
					workDayId: session.workDayId,
					employeeId: session.employeeId,
					servedNumber: { gt: session.servedNumber + offset },
				},
				data: { servedNumber: { decrement: offset + 1 } },
			});
			return { status: "deleted", id: sessionId };
		});
	}
	async pay(merchantId: string, sessionId: string, data: PaymentDto) {
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM service_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
			const session = await tx.serviceSession.findFirst({
				where: { id: sessionId, merchantId },
				include: { payments: true },
			});
			if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
			if (session.status !== "IN_PROGRESS")
				throw new ConflictException({ code: "INVALID_SESSION_STATE" });
			if (session.payments.length) {
				const existingServices = data.services.filter((service) => service.id);
				const ids = new Set(existingServices.map((service) => service.id));
				if (ids.size !== session.payments.length || session.payments.some((payment) => !ids.has(payment.id)))
					throw new ConflictException({ code: "SERVICES_CHANGED" });
				await Promise.all(existingServices.map((service) => tx.payment.update({
					where: { id: service.id! },
					data: {
						amount: new Prisma.Decimal(service.amount),
						currency: service.currency,
						method: service.method,
					},
				})));
				const addedServices = data.services.filter((service) => !service.id);
				if (addedServices.length) {
					await tx.payment.createMany({
						data: addedServices.map((service) => this.paymentData(merchantId, sessionId, service)),
					});
				}
			} else {
				await tx.payment.createMany({
					data: data.services.map((service) => this.paymentData(merchantId, sessionId, service)),
				});
			}
			return tx.serviceSession.update({
				where: { id: sessionId },
				data: { status: "PAID", completedAt: new Date() },
				include: { employee: true, payments: true },
			});
		});
	}
	async removeSession(merchantId: string, sessionId: string) {
		return this.db.$transaction(async (tx) => {
			const session = await tx.serviceSession.findFirst({
				where: { id: sessionId, merchantId, status: "IN_PROGRESS" },
				select: { id: true },
			});
			if (!session) throw new ConflictException({ code: "INVALID_SESSION_STATE" });
			await tx.payment.deleteMany({ where: { serviceSessionId: sessionId, merchantId } });
			await tx.serviceSession.delete({ where: { id: sessionId } });
			return { status: "deleted", id: sessionId };
		});
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
			const payments = sessions.flatMap((session) => session.payments);
			const revenue = payments.reduce(
				(sum, payment) => payment.amount ? sum.plus(payment.amount) : sum,
				new Prisma.Decimal(0),
			);
			return {
				employeeId: employee.id,
				name: employee.name,
				customersServed: sessions.length,
				roundsEarned: roundsForServices(payments),
				revenue: revenue.toFixed(2),
			};
		});
		const paid = day.sessions.filter((session) => session.status === "PAID");
		const payments = paid.flatMap((session) => session.payments);
		const cashTotal = payments.reduce(
			(sum, payment) => payment.method === "CASH" && payment.amount ? sum.plus(payment.amount) : sum,
			new Prisma.Decimal(0),
		);
		const paypalTotal = payments.reduce(
			(sum, payment) => payment.method === "PAYPAL" && payment.amount ? sum.plus(payment.amount) : sum,
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
		return this.withNextEmployee(day);
	}
	private async requireSession(merchantId: string, id: string) {
		const session = await this.db.serviceSession.findFirst({
			where: { id, merchantId },
			include: { employee: true, payments: true },
		});
		if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
		return session;
	}
	private async requireInProgressSession(merchantId: string, id: string) {
		const session = await this.db.serviceSession.findFirst({
			where: { id, merchantId, status: "IN_PROGRESS" },
			select: { id: true },
		});
		if (!session) throw new ConflictException({ code: "INVALID_SESSION_STATE" });
		return session;
	}
	private paymentData(
		merchantId: string,
		serviceSessionId: string,
		service: PaymentDto["services"][number],
	) {
		return {
			merchantId,
			serviceSessionId,
			serviceName: service.serviceName.trim(),
			amount: new Prisma.Decimal(service.amount),
			currency: service.currency,
			method: service.method,
		};
	}
	private roundsByEmployee(
		roster: { employeeId: string }[],
		sessions: { employeeId: string; status: SessionStatus; payments: { amount: Prisma.Decimal | null; currency: string }[] }[],
	) {
		const rounds = new Map(roster.map((entry) => [entry.employeeId, 0]));
		for (const session of sessions) {
			if (session.status !== "PAID") continue;
			rounds.set(
				session.employeeId,
				(rounds.get(session.employeeId) ?? 0) + roundsForServices(session.payments),
			);
		}
		return rounds;
	}
	private withNextEmployee(day: DayWithDetails) {
		const busy = new Set(
			day.sessions.filter((session) => session.status === "IN_PROGRESS").map((session) => session.employeeId),
		);
		return {
			...day,
			nextEmployeeId: selectNextEmployee(
				day.roster,
				day.nextPosition,
				busy,
				this.roundsByEmployee(day.roster, day.sessions),
			)?.employeeId ?? null,
		};
	}
}
