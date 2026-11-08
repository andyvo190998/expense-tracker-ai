import { authFetch } from "@/lib/auth-api";
export type {
	Employee,
	EmployeeSummary,
	PaymentMethod,
	Session,
	Summary,
	WorkDay,
} from "@expense-tracker/contracts";
export type RosterItem = {
	employeeId: string;
	name: string;
	isAvailable: boolean;
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
