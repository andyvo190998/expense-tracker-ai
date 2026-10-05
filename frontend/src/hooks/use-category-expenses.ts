import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-api";
import { expenseQueryKey } from "@/lib/auth-query-key";
import { useAuth } from "@/contexts/auth-context";

import { monthRange } from "@/lib/expense-period";

export type CategoryExpenses = {
	currency: string;
	total: string;
	start_date: string;
	end_date: string;
	items: { category: string; amount: string }[];
};

async function getCategoryExpenses(month: string): Promise<CategoryExpenses> {
	const { startDate, endDate } = monthRange(month);
	const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
	const response = await authFetch(`/api/expenses/by-category?${query}`);
	if (!response.ok) throw new Error("Could not load category expenses");
	return response.json() as Promise<CategoryExpenses>;
}

export function useCategoryExpenses(month: string) {
	const { user } = useAuth();
	return useQuery({
		queryKey: expenseQueryKey(user?.id ?? "visitor", "by-category", month),
		queryFn: () => getCategoryExpenses(month),
		enabled: user?.role === "merchant",
	});
}
