export class EmployeeResponseDto {
	id!: string;
	merchantId!: string;
	name!: string;
	isActive!: boolean;
	sortOrder!: number;
	createdAt!: Date;
	updatedAt!: Date;
}

export class PaymentResponseDto {
	id!: string;
	merchantId!: string;
	serviceSessionId!: string;
	serviceName!: string;
	amount!: string | null;
	currency!: string;
	method!: "CASH" | "PAYPAL" | null;
	receivedAt!: Date;
}

export class SessionResponseDto {
	id!: string;
	merchantId!: string;
	workDayId!: string;
	employeeId!: string;
	sequenceNumber!: number;
	servedNumber!: number;
	customerName!: string | null;
	status!: "IN_PROGRESS" | "PAID" | "CANCELLED";
	startedAt!: Date;
	completedAt!: Date | null;
	cancelledAt!: Date | null;
	employee!: EmployeeResponseDto;
	payments!: PaymentResponseDto[];
}

export class RosterResponseDto {
	workDayId!: string;
	employeeId!: string;
	position!: number;
	isAvailable!: boolean;
	unavailableReason!: string | null;
	employee!: EmployeeResponseDto;
}

export class WorkDayResponseDto {
	id!: string;
	merchantId!: string;
	businessDate!: Date;
	status!: "OPEN" | "CLOSED";
	nextPosition!: number;
	nextEmployeeId!: string | null;
	startedAt!: Date;
	closedAt!: Date | null;
	roster!: RosterResponseDto[];
	sessions!: SessionResponseDto[];
}

export class EmployeeSummaryResponseDto {
	employeeId!: string;
	customersServed!: number;
	roundsEarned!: number;
	revenue!: string;
}

export class SummaryResponseDto {
	cashTotal!: string;
	paypalTotal!: string;
	total!: string;
	employees!: EmployeeSummaryResponseDto[];
}

export class DeletedResponseDto {
	status!: string;
	id!: string;
}
