import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmployeeCard, EmployeesCard } from "./workday-components";

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

it("submits an edited employee name", () => {
	const onUpdate = vi.fn();
	render(
		<EmployeesCard
			employees={[entry.employee]}
			name=""
			onAdd={() => undefined}
			onDelete={() => undefined}
			onNameChange={() => undefined}
			onUpdate={onUpdate}
		/>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Edit Anna" }));
	fireEvent.change(screen.getByRole("textbox", { name: "Employee name for Anna" }), {
		target: { value: "Annie" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save Annie" }));

	expect(onUpdate).toHaveBeenCalledWith("employee-id", "Annie");
});

it("cancels editing without updating the employee", () => {
	const onUpdate = vi.fn();
	render(
		<EmployeesCard
			employees={[entry.employee]}
			name=""
			onAdd={() => undefined}
			onDelete={() => undefined}
			onNameChange={() => undefined}
			onUpdate={onUpdate}
		/>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Edit Anna" }));
	fireEvent.click(screen.getByRole("button", { name: "Cancel editing Anna" }));

	expect(onUpdate).not.toHaveBeenCalled();
	expect(screen.getByText("Anna")).toBeInTheDocument();
});

it("requires confirmation before deleting an employee", () => {
	const onDelete = vi.fn();
	render(
		<EmployeesCard
			employees={[entry.employee]}
			name=""
			onAdd={() => undefined}
			onDelete={onDelete}
			onNameChange={() => undefined}
			onUpdate={() => undefined}
		/>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Delete Anna" }));
	expect(onDelete).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Delete employee" }));

	expect(onDelete).toHaveBeenCalledWith("employee-id");
});
