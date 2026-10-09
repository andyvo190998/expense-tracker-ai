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

	it("keeps the normal turn when a later employee starts early", () => {
		expect(selectNextEmployee(roster, 1, new Set(), "four")).toEqual({
			employeeId: "four",
			nextPosition: 1,
		});
	});

	it("does not return to an earlier employee when they finish", () => {
		const availableRoster = roster.map((entry) => ({ ...entry, isAvailable: true }));
		const first = selectNextEmployee(availableRoster, 0, new Set(), "one");
		const second = selectNextEmployee(availableRoster, first!.nextPosition, new Set(["one"]), "two");
		const fourth = selectNextEmployee(
			availableRoster,
			second!.nextPosition,
			new Set(["one", "two"]),
			"four",
		);

		expect(first?.nextPosition).toBe(1);
		expect(second?.nextPosition).toBe(2);
		expect(fourth?.nextPosition).toBe(2);
		expect(
			selectNextEmployee(availableRoster, fourth!.nextPosition, new Set(["two", "four"])),
		).toMatchObject({ employeeId: "three" });
	});
});
