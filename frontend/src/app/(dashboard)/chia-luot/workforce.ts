import { authFetch } from "@/lib/auth-api";

export type Employee = { id: string; name: string; sortOrder: number };
export type PaymentMethod = "CASH" | "PAYPAL";
export type Session = {
	id: string;
	employeeId: string;
	sequenceNumber: number;
	customerName: string | null;
	status: "IN_PROGRESS" | "PAID" | "CANCELLED";
	startedAt: string;
	completedAt: string | null;
	employee: Employee;
	payments: { amount: string; currency: string; method: PaymentMethod }[];
};
export type RosterItem = {
	employeeId: string;
	name: string;
	isAvailable: boolean;
};
export type WorkDay = {
	id: string;
	nextPosition: number;
	roster: {
		employeeId: string;
		position: number;
		isAvailable: boolean;
		employee: Employee;
	}[];
	sessions: Session[];
};
export type EmployeeSummary = {
	employeeId: string;
	customersServed: number;
	revenue: string;
};
export type Summary = {
	cashTotal: string;
	paypalTotal: string;
	total: string;
	employees: EmployeeSummary[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authFetch(`/api/workforce/${path}`, init);
	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		throw new Error(error?.message?.code ?? error?.message ?? error?.code ?? "Request failed");
	}
	return response.json();
}

export function elapsed(startedAt: string, endedAt?: string | null) {
	const seconds = Math.max(
		0,
		Math.floor(
			(new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 1000,
		),
	);
	return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
