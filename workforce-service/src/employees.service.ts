import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { CreateEmployeeDto, UpdateEmployeeDto } from "./dtos";

@Injectable()
export class EmployeesService {
	constructor(private readonly db: PrismaService) {}
	list(merchantId: string) {
		return this.db.employee.findMany({
			where: { merchantId, isActive: true },
			orderBy: { sortOrder: "asc" },
		});
	}
	async create(merchantId: string, data: CreateEmployeeDto) {
		const last = await this.db.employee.aggregate({
			where: { merchantId },
			_max: { sortOrder: true },
		});
		return this.db.employee.create({
			data: {
				merchantId,
				name: data.name.trim(),
				sortOrder: (last._max.sortOrder ?? -1) + 1,
			},
		});
	}
	async update(merchantId: string, id: string, data: UpdateEmployeeDto) {
		const employee = await this.db.employee.findFirst({ where: { id, merchantId } });
		if (!employee) throw new NotFoundException({ code: "EMPLOYEE_NOT_FOUND" });
		if (
			data.isActive === false &&
			(await this.db.serviceSession.count({
				where: { employeeId: id, status: "IN_PROGRESS" },
			}))
		)
			throw new ConflictException({ code: "EMPLOYEE_BUSY" });
		return this.db.employee.update({
			where: { id },
			data: { ...data, name: data.name?.trim() },
		});
	}
}
