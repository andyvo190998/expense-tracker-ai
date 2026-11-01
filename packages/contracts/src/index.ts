import createClient from "openapi-fetch";

import type {
	components as ExpenseComponents,
	paths as ExpensePaths,
} from "./generated/expense";
import type {
	components as WorkforceComponents,
	paths as WorkforcePaths,
} from "./generated/workforce";

type ClientOptions = {
	baseUrl: string;
	fetch?: typeof globalThis.fetch;
};

function clientOptions(options: ClientOptions) {
	const baseUrl = new URL(
		options.baseUrl,
		globalThis.location?.origin ?? "http://localhost",
	).toString().replace(/\/$/, "");
	return { ...options, baseUrl };
}

export function createExpenseClient(options: ClientOptions) {
	return createClient<ExpensePaths>(clientOptions(options));
}

export function createWorkforceClient(options: ClientOptions) {
	return createClient<WorkforcePaths>(clientOptions(options));
}

export type { ExpenseComponents, ExpensePaths, WorkforceComponents, WorkforcePaths };

export type Expense = ExpenseComponents["schemas"]["ExpenseResponse"];
export type CategoryExpenses = ExpenseComponents["schemas"]["CategoryExpenseResponse"];
type WorkforceEmployee = WorkforceComponents["schemas"]["EmployeeResponseDto"];
type WorkforcePayment = WorkforceComponents["schemas"]["PaymentResponseDto"];
type WorkforceSession = WorkforceComponents["schemas"]["SessionResponseDto"];
type WorkforceWorkDay = WorkforceComponents["schemas"]["WorkDayResponseDto"];

export type Employee = Pick<WorkforceEmployee, "id" | "name" | "sortOrder">;
export type PaymentMethod = WorkforceComponents["schemas"]["ServiceInputDto"]["method"];
export type Session = Pick<
	WorkforceSession,
	| "id"
	| "employeeId"
	| "sequenceNumber"
	| "servedNumber"
	| "customerName"
	| "status"
	| "startedAt"
	| "completedAt"
> & {
	employee: Employee;
	payments: Pick<
		WorkforcePayment,
		"id" | "serviceName" | "amount" | "currency" | "method"
	>[];
};
export type WorkDay = Pick<WorkforceWorkDay, "id" | "nextPosition" | "nextEmployeeId"> & {
	roster: Array<
		Pick<WorkforceWorkDay["roster"][number], "employeeId" | "position" | "isAvailable"> & {
			employee: Employee;
		}
	>;
	sessions: Session[];
};
export type EmployeeSummary = WorkforceComponents["schemas"]["EmployeeSummaryResponseDto"];
export type Summary = WorkforceComponents["schemas"]["SummaryResponseDto"];
