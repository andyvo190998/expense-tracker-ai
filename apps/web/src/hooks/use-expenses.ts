import { useQuery } from "@tanstack/react-query";
import type { Expense } from "@expense-tracker/contracts";
import { authFetch } from "@/lib/auth-api";
import { expenseQueryKey } from "@/lib/auth-query-key";
import { useAuth } from "@/contexts/auth-context";

import { monthRange } from "@/lib/expense-period";

export type { Expense } from "@expense-tracker/contracts";

async function getExpenses(month: string): Promise<Expense[]> {
	const { startDate, endDate } = monthRange(month);
	const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
	const response = await authFetch(`/api/expenses?${query}`);
	if (!response.ok) throw new Error("Could not load expenses");
	return response.json() as Promise<Expense[]>;
}

export function useExpenses(month: string) {
	const { user } = useAuth();
	return useQuery({
		queryKey: expenseQueryKey(user?.id ?? "visitor", month),
		queryFn: () => getExpenses(month),
		enabled: user?.role === "merchant",
	});
}
