const expenseTools = new Set([
	"add_expense",
	"update_expense",
	"delete_expense",
	"find_expenses",
]);
const successfulStatuses = new Set(["created", "updated", "deleted", "success"]);

export function shouldInvalidateExpenseQueries(
	toolName: string,
	result: string,
	error?: string,
) {
	if (error || !expenseTools.has(toolName)) return false;
	try {
		const parsed: unknown = JSON.parse(result);
		return (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			"status" in parsed &&
			typeof parsed.status === "string" &&
			successfulStatuses.has(parsed.status)
		);
	} catch {
		return false;
	}
}

export function createExpenseToolResultTracker(invalidate: () => void) {
	const toolNames = new Map<string, string>();
	return {
		onToolCallStart(toolCallId: string, toolName: string) {
			toolNames.set(toolCallId, toolName);
		},
		onToolCallResult(toolCallId: string, result: string) {
			const toolName = toolNames.get(toolCallId);
			toolNames.delete(toolCallId);
			if (toolName && shouldInvalidateExpenseQueries(toolName, result)) invalidate();
		},
	};
}
