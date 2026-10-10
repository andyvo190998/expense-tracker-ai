import { roundsForServices, selectNextEmployee } from "../src/work-days/turn-selection";

describe("selectNextEmployee", () => {
	const roster = [
		{ employeeId: "one", position: 0, isAvailable: true },
		{ employeeId: "two", position: 1, isAvailable: true },
		{ employeeId: "three", position: 2, isAvailable: false },
		{ employeeId: "four", position: 3, isAvailable: true },
	];

	it("keeps fixed positions while skipping vacation and busy employees", () => {
		expect(selectNextEmployee(roster, 1, new Set(["two"]), new Map())).toEqual({
			employeeId: "four",
			nextPosition: 0,
		});
	});

	it("wraps around the fixed roster", () => {
		expect(selectNextEmployee(roster, 3, new Set(["four"]), new Map())).toEqual({
			employeeId: "one",
			nextPosition: 1,
		});
	});

	it("returns null when nobody can take a customer", () => {
		expect(selectNextEmployee(roster, 0, new Set(["one", "two", "four"]), new Map())).toBeNull();
	});

	it("keeps the normal turn when a later employee starts early", () => {
		expect(selectNextEmployee(roster, 1, new Set(), new Map(), "four")).toEqual({
			employeeId: "four",
			nextPosition: 1,
		});
	});

	it("does not return to an earlier employee when they finish", () => {
		const availableRoster = roster.map((entry) => ({ ...entry, isAvailable: true }));
		const first = selectNextEmployee(availableRoster, 0, new Set(), new Map(), "one");
		const second = selectNextEmployee(availableRoster, first!.nextPosition, new Set(["one"]), new Map(), "two");
		const fourth = selectNextEmployee(
			availableRoster,
			second!.nextPosition,
			new Set(["one", "two"]),
			new Map(),
			"four",
		);

		expect(first?.nextPosition).toBe(1);
		expect(second?.nextPosition).toBe(2);
		expect(fourth?.nextPosition).toBe(2);
		expect(
			selectNextEmployee(availableRoster, fourth!.nextPosition, new Set(["two", "four"]), new Map()),
		).toMatchObject({ employeeId: "three" });
	});

	it("counts only EUR services strictly over 30 euros", () => {
		expect(roundsForServices([{ amount: "30.00", currency: "EUR" }])).toBe(0);
		expect(roundsForServices([{ amount: "30.01", currency: "EUR" }])).toBe(1);
		expect(roundsForServices([
			{ amount: "20.00", currency: "EUR" },
			{ amount: "40.00", currency: "EUR" },
		])).toBe(1);
	});

	it("lets lower-round employees catch up in roster order", () => {
		const fairRoster = [
			{ employeeId: "anna", position: 0, isAvailable: true },
			{ employeeId: "bob", position: 1, isAvailable: true },
			{ employeeId: "carla", position: 2, isAvailable: true },
		];
		const rounds = new Map([["anna", 2], ["bob", 0], ["carla", 0]]);
		const selected: string[] = [];
		let cursor = 1;
		for (let index = 0; index < 5; index++) {
			const next = selectNextEmployee(fairRoster, cursor, new Set(), rounds)!;
			selected.push(next.employeeId);
			rounds.set(next.employeeId, (rounds.get(next.employeeId) ?? 0) + 1);
			cursor = next.nextPosition;
		}

		expect(selected).toEqual(["bob", "carla", "bob", "carla", "anna"]);
	});

	it("skips unavailable and busy employees at the minimum round count", () => {
		expect(selectNextEmployee(
			roster,
			0,
			new Set(["one"]),
			new Map([["one", 0], ["two", 0], ["four", 2]]),
		)).toMatchObject({ employeeId: "two" });
	});
});
