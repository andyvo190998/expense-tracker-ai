import { selectNextEmployee } from "../src/work-days/turn-selection";

describe("selectNextEmployee", () => {
	const roster = [
		{ employeeId: "one", position: 0, isAvailable: true },
		{ employeeId: "two", position: 1, isAvailable: true },
		{ employeeId: "three", position: 2, isAvailable: false },
		{ employeeId: "four", position: 3, isAvailable: true },
	];

	it("keeps fixed positions while skipping vacation and busy employees", () => {
		expect(selectNextEmployee(roster, 1, new Set(["two"]))).toEqual({
			employeeId: "four",
			nextPosition: 0,
		});
	});

	it("wraps around the fixed roster", () => {
		expect(selectNextEmployee(roster, 3, new Set(["four"]))).toEqual({
			employeeId: "one",
			nextPosition: 1,
		});
	});

	it("returns null when nobody can take a customer", () => {
		expect(selectNextEmployee(roster, 0, new Set(["one", "two", "four"]))).toBeNull();
	});

	it("keeps the normal turn when a different employee is selected", () => {
		expect(selectNextEmployee(roster, 1, new Set(), "four")).toEqual({
			employeeId: "four",
			nextPosition: 1,
		});
	});
});
