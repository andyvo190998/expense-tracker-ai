import assert from "node:assert/strict";
import test from "node:test";

import { expenseQueryKey } from "./auth-query-key.ts";

test("separates cached expense data by authenticated user", () => {
	assert.notDeepEqual(
		expenseQueryKey("user-a", "2026-10"),
		expenseQueryKey("user-b", "2026-10"),
	);
});
