import assert from "node:assert/strict";
import test from "node:test";

import {
	budgetProgress,
	currentMonth,
	monthRange,
	pageItems,
	percentageOf,
} from "./expense-period.ts";

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

test("calculates current spending as a percentage of the monthly total", () => {
	assert.equal(percentageOf(20, 400), 5);
	assert.equal(percentageOf(200, 400), 50);
	assert.equal(percentageOf(500, 400), 125);
});

test("reports the amount remaining and uncapped spending percentage", () => {
	assert.deepEqual(budgetProgress(125, 500), {
		percentage: 25,
		remaining: 375,
		exceeded: 0,
	});
});

test("caps visual progress and reports the amount over target", () => {
	assert.deepEqual(budgetProgress(625, 500), {
		percentage: 100,
		remaining: 0,
		exceeded: 125,
	});
});
