import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { MerchantId } from "./auth";
import {
	AssignmentDto,
	AvailabilityDto,
	CreateServedCustomerDto,
	CreateEmployeeDto,
	PaymentDto,
	ReorderServedCustomersDto,
	StartWorkDayDto,
	UpdateEmployeeDto,
	UpdateServedCustomerDto,
} from "./dtos";
import { EmployeesService } from "./employees.service";
import { WorkDaysService } from "./work-days.service";

@Controller("v1/employees")
export class EmployeesController {
	constructor(private readonly employees: EmployeesService) {}
	@Get() list(@MerchantId() merchantId: string) {
		return this.employees.list(merchantId);
	}
	@Post() create(@MerchantId() merchantId: string, @Body() data: CreateEmployeeDto) {
		return this.employees.create(merchantId, data);
	}
	@Patch(":id") update(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: UpdateEmployeeDto,
	) {
		return this.employees.update(merchantId, id, data);
	}
	@Delete(":id") archive(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.employees.update(merchantId, id, { isActive: false });
	}
}

@Controller("v1/work-days")
export class WorkDaysController {
	constructor(private readonly days: WorkDaysService) {}
	@Get("current") current(@MerchantId() merchantId: string) {
		return this.days.current(merchantId);
	}
	@Post() start(@MerchantId() merchantId: string, @Body() data: StartWorkDayDto) {
		return this.days.start(merchantId, data);
	}
	@Get(":id") get(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.get(merchantId, id);
	}
	@Patch(":id/employees/:employeeId") availability(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Param("employeeId") employeeId: string,
		@Body() data: AvailabilityDto,
	) {
		return this.days.availability(merchantId, id, employeeId, data);
	}
	@Post(":id/assignments") assign(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: AssignmentDto,
	) {
		return this.days.assign(merchantId, id, data);
	}
	@Post(":id/served-customers") createServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: CreateServedCustomerDto,
	) {
		return this.days.createServedCustomer(merchantId, id, data);
	}
	@Patch(":id/served-customers/order") reorderServedCustomers(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: ReorderServedCustomersDto,
	) {
		return this.days.reorderServedCustomers(merchantId, id, data);
	}
	@Post(":id/close") close(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.close(merchantId, id);
	}
	@Get(":id/summary") summary(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.summary(merchantId, id);
	}
}

@Controller("v1/sessions")
export class SessionsController {
	constructor(private readonly days: WorkDaysService) {}
	@Post(":id/payments") pay(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: PaymentDto,
	) {
		return this.days.pay(merchantId, id, data);
	}
	@Patch(":id/served-customer") updateServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: UpdateServedCustomerDto,
	) {
		return this.days.updateServedCustomer(merchantId, id, data);
	}
	@Delete(":id/served-customer") deleteServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
	) {
		return this.days.deleteServedCustomer(merchantId, id);
	}
	@Delete(":id") remove(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.removeSession(merchantId, id);
	}
}
