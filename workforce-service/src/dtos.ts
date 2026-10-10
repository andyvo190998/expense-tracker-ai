import {
	ArrayNotEmpty,
	Equals,
	IsArray,
	IsBoolean,
	IsEnum,
	IsISO8601,
	IsNotEmpty,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	Min,
	ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod } from "@prisma/client";

export class CreateEmployeeDto {
	@IsString() @IsNotEmpty() @MaxLength(100) name!: string;
}
export class ServiceInputDto {
	@IsOptional() @IsUUID() id?: string;
	@IsString() @MaxLength(100) serviceName = "";
	@Matches(/^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/) amount!: string;
	@IsOptional() @Equals("EUR") currency = "EUR";
	@IsEnum(PaymentMethod) method!: PaymentMethod;
}
export class DraftServiceDto {
	@IsString() @MaxLength(100) serviceName = "";
}
export class UpdateEmployeeDto {
	@IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
	@IsOptional() @IsBoolean() isActive?: boolean;
}
export class RosterEntryDto {
	@IsUUID() employeeId!: string;
	@IsBoolean() isAvailable!: boolean;
	@IsOptional() @IsString() @MaxLength(200) unavailableReason?: string;
}
export class StartWorkDayDto {
	@IsISO8601({ strict: true }) businessDate!: string;
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => RosterEntryDto)
	employees!: RosterEntryDto[];
}
export class AvailabilityDto {
	@IsBoolean() isAvailable!: boolean;
	@IsOptional() @IsString() @MaxLength(200) unavailableReason?: string;
}
export class AssignmentDto {
	@IsOptional() @IsString() @MaxLength(100) customerName?: string;
	@IsOptional() @IsUUID() employeeId?: string;
}
export class PaymentDto {
	@IsArray()
	@ArrayNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => ServiceInputDto)
	services!: ServiceInputDto[];
}
export class CreateServedCustomerDto extends PaymentDto {
	@IsUUID() employeeId!: string;
	@IsOptional() @IsInt() @Min(1) servedNumber?: number;
	@IsOptional() @IsString() @MaxLength(100) customerName?: string;
}
export class UpdateServedCustomerDto {
	@IsOptional() @IsInt() @Min(1) servedNumber?: number;
	@IsOptional() @IsString() @MaxLength(100) customerName?: string;
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => ServiceInputDto)
	services?: ServiceInputDto[];
}
export class ReorderServedCustomersDto {
	@IsUUID() employeeId!: string;
	@IsArray() @ArrayNotEmpty() @IsUUID("4", { each: true }) sessionIds!: string[];
}
