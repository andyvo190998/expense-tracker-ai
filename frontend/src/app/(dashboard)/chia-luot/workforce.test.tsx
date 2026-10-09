import { describe, expect, it } from "vitest";
import { nextEmployeeId } from "./workforce";

describe("nextEmployeeId", () => {
	it("skips unavailable and busy employees from the rotation cursor", () => {
		const roster = [
			{ employeeId: "one", position: 0, isAvailable: true },
			{ employeeId: "two", position: 1, isAvailable: true },
			{ employeeId: "three", position: 2, isAvailable: false },
			{ employeeId: "four", position: 3, isAvailable: true },
		];

		expect(nextEmployeeId(roster, 1, new Set(["two"]))).toBe("four");
	});

	it("returns no employee when everyone is unavailable or busy", () => {
		const roster = [
			{ employeeId: "one", position: 0, isAvailable: true },
			{ employeeId: "two", position: 1, isAvailable: false },
		];

		expect(nextEmployeeId(roster, 0, new Set(["one"]))).toBeUndefined();
	});
});
