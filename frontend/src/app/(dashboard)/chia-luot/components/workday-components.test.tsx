import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmployeeCard } from "./workday-components";

afterEach(cleanup);

const entry = {
	employeeId: "employee-id",
	position: 0,
	isAvailable: true,
	employee: { id: "employee-id", name: "Anna", sortOrder: 0 },
};

it("selects an available idle employee as the next turn", () => {
	const onSetNext = vi.fn();
	render(
		<EmployeeCard
			entry={entry}
			index={0}
			isNext={false}
			onAssign={() => undefined}
			onAvailabilityChange={() => undefined}
			onCancel={() => undefined}
			onComplete={() => undefined}
			onSetNext={onSetNext}
			onViewServed={() => undefined}
		/>,
	);

	fireEvent.click(screen.getByRole("switch", { name: "Set Anna as next turn" }));
	expect(onSetNext).toHaveBeenCalledOnce();
});

it("does not allow the current next employee to be switched off", () => {
	render(
		<EmployeeCard
			entry={entry}
			index={0}
			isNext
			onAssign={() => undefined}
			onAvailabilityChange={() => undefined}
			onCancel={() => undefined}
			onComplete={() => undefined}
			onSetNext={() => undefined}
			onViewServed={() => undefined}
		/>,
	);

	expect(screen.getByRole("switch", { name: "Set Anna as next turn" })).toBeDisabled();
});
