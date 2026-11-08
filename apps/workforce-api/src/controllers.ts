import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse } from "@nestjs/swagger";
import { MerchantId } from "./auth";
import {
	AssignmentDto,
	AvailabilityDto,
	CreateServedCustomerDto,
	CreateEmployeeDto,
	DraftServiceDto,
	PaymentDto,
	ReorderServedCustomersDto,
	StartWorkDayDto,
	UpdateEmployeeDto,
	UpdateServedCustomerDto,
} from "./dtos";
import { EmployeesService } from "./employees.service";
import { WorkDaysService } from "./work-days.service";
import {
	DeletedResponseDto,
	EmployeeResponseDto,
	PaymentResponseDto,
	SessionResponseDto,
	SummaryResponseDto,
	WorkDayResponseDto,
} from "./response.dto";

@Controller("v1/employees")
export class EmployeesController {
	constructor(private readonly employees: EmployeesService) {}
	@ApiOkResponse({ type: EmployeeResponseDto, isArray: true })
	@Get() list(@MerchantId() merchantId: string) {
		return this.employees.list(merchantId);
	}
	@ApiCreatedResponse({ type: EmployeeResponseDto })
	@Post() create(@MerchantId() merchantId: string, @Body() data: CreateEmployeeDto) {
		return this.employees.create(merchantId, data);
	}
	@ApiOkResponse({ type: EmployeeResponseDto })
	@Patch(":id") update(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: UpdateEmployeeDto,
	) {
		return this.employees.update(merchantId, id, data);
	}
	@ApiOkResponse({ type: EmployeeResponseDto })
	@Delete(":id") archive(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.employees.update(merchantId, id, { isActive: false });
	}
}

@Controller("v1/work-days")
export class WorkDaysController {
	constructor(private readonly days: WorkDaysService) {}
	@ApiOkResponse({ type: WorkDayResponseDto, nullable: true })
	@Get("current") current(@MerchantId() merchantId: string) {
		return this.days.current(merchantId);
	}
	@ApiCreatedResponse({ type: WorkDayResponseDto })
	@Post() start(@MerchantId() merchantId: string, @Body() data: StartWorkDayDto) {
		return this.days.start(merchantId, data);
	}
	@ApiOkResponse({ type: WorkDayResponseDto })
	@Get(":id") get(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.get(merchantId, id);
	}
	@ApiOkResponse({ type: WorkDayResponseDto })
	@Patch(":id/employees/:employeeId") availability(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Param("employeeId") employeeId: string,
		@Body() data: AvailabilityDto,
	) {
		return this.days.availability(merchantId, id, employeeId, data);
	}
	@ApiOkResponse({ type: WorkDayResponseDto })
	@Patch(":id/next-employee/:employeeId") setNext(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Param("employeeId") employeeId: string,
	) {
		return this.days.setNext(merchantId, id, employeeId);
	}
	@ApiCreatedResponse({ type: SessionResponseDto })
	@Post(":id/assignments") assign(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: AssignmentDto,
	) {
		return this.days.assign(merchantId, id, data);
	}
	@ApiCreatedResponse({ type: SessionResponseDto })
	@Post(":id/served-customers") createServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: CreateServedCustomerDto,
	) {
		return this.days.createServedCustomer(merchantId, id, data);
	}
	@ApiOkResponse({ type: SessionResponseDto, isArray: true })
	@Patch(":id/served-customers/order") reorderServedCustomers(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: ReorderServedCustomersDto,
	) {
		return this.days.reorderServedCustomers(merchantId, id, data);
	}
	@ApiCreatedResponse({ type: WorkDayResponseDto })
	@Post(":id/close") close(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.close(merchantId, id);
	}
	@ApiOkResponse({ type: SummaryResponseDto })
	@Get(":id/summary") summary(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.summary(merchantId, id);
	}
}

@Controller("v1/sessions")
export class SessionsController {
	constructor(private readonly days: WorkDaysService) {}
	@ApiCreatedResponse({ type: PaymentResponseDto })
	@Post(":id/services") addService(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: DraftServiceDto,
	) {
		return this.days.addService(merchantId, id, data);
	}
	@ApiOkResponse({ type: PaymentResponseDto })
	@Patch(":id/services/:serviceId") updateService(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Param("serviceId") serviceId: string,
		@Body() data: DraftServiceDto,
	) {
		return this.days.updateService(merchantId, id, serviceId, data);
	}
	@ApiOkResponse({ type: DeletedResponseDto })
	@Delete(":id/services/:serviceId") deleteService(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Param("serviceId") serviceId: string,
	) {
		return this.days.deleteService(merchantId, id, serviceId);
	}
	@ApiCreatedResponse({ type: SessionResponseDto })
	@Post(":id/payments") pay(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: PaymentDto,
	) {
		return this.days.pay(merchantId, id, data);
	}
	@ApiOkResponse({ type: SessionResponseDto })
	@Patch(":id/served-customer") updateServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
		@Body() data: UpdateServedCustomerDto,
	) {
		return this.days.updateServedCustomer(merchantId, id, data);
	}
	@ApiOkResponse({ type: DeletedResponseDto })
	@Delete(":id/served-customer") deleteServedCustomer(
		@MerchantId() merchantId: string,
		@Param("id") id: string,
	) {
		return this.days.deleteServedCustomer(merchantId, id);
	}
	@ApiOkResponse({ type: DeletedResponseDto })
	@Delete(":id") remove(@MerchantId() merchantId: string, @Param("id") id: string) {
		return this.days.removeSession(merchantId, id);
	}
}
