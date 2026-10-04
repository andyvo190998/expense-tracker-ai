import assert from "node:assert/strict";
import test from "node:test";

import { currentMonth, monthRange, pageItems } from "./expense-period.ts";

test("builds inclusive calendar-month ranges", () => {
	assert.deepEqual(monthRange("2026-09"), {
		startDate: "2026-09-01",
		endDate: "2026-09-30",
	});
	assert.deepEqual(monthRange("2024-02"), {
		startDate: "2024-02-01",
		endDate: "2024-02-29",
	});
	assert.deepEqual(monthRange("2026-12"), {
		startDate: "2026-12-01",
		endDate: "2026-12-31",
	});
});

test("uses the current local month by default", () => {
	assert.equal(currentMonth(new Date(2026, 8, 21)), "2026-09");
});

test("returns five items for the requested one-based page", () => {
	assert.deepEqual(pageItems([1, 2, 3, 4, 5, 6], 1), [1, 2, 3, 4, 5]);
	assert.deepEqual(pageItems([1, 2, 3, 4, 5, 6], 2), [6]);
});
