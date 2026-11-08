export function expenseQueryKey(userId: string, ...parts: string[]) {
	return ["expenses", userId, ...parts] as const;
}
