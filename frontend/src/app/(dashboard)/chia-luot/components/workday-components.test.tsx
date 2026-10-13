import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { EmployeeCard, EmployeesCard, PaymentDialog, RoundOverview } from "./workday-components";
import { emptyService, type ServiceInput } from "./service-editor";

afterEach(cleanup);

const entry = {
	employeeId: "employee-id",
	position: 0,
	isAvailable: true,
	employee: { id: "employee-id", name: "Anna", sortOrder: 0 },
};

it("keeps setup order and highlights the three employees furthest behind", () => {
	const roster = ["A", "B", "C", "D", "E", "F"].map((name, position) => ({
		employeeId: name,
		position,
		isAvailable: true,
		employee: { id: name, name, sortOrder: position },
	}));
	const rounds = [3, 3, 3, 2, 1, 0];

	render(
		<RoundOverview
			roster={roster}
			totals={
				new Map(
					roster.map((item, index) => [
						item.employeeId,
						{
							employeeId: item.employeeId,
							customersServed: 0,
							roundsEarned: rounds[index],
							revenue: "0.00",
						},
					]),
				)
			}
		/>,
	);

	const overview = screen.getByRole("region", { name: "Round overview" });
	expect(
		within(overview)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual([
		"A3 rounds",
		"B3 rounds",
		"C3 rounds",
		"D2 roundsNeeds round",
		"E1 roundNeeds round",
		"F0 roundsNeeds round",
	]);
	expect(within(overview).getAllByText("Needs round")).toHaveLength(3);
});

it("does not highlight employees when everyone has the same round count", () => {
	render(
		<RoundOverview
			roster={[entry]}
			totals={
				new Map([
					[
						entry.employeeId,
						{
							employeeId: entry.employeeId,
							customersServed: 1,
							roundsEarned: 2,
							revenue: "30.00",
						},
					],
				])
			}
		/>,
	);

	expect(screen.queryByText("Needs round")).not.toBeInTheDocument();
});

it("uses setup order when more than three lagging employees are tied", () => {
	const roster = ["A", "B", "C", "D", "E"].map((name, position) => ({
		employeeId: name,
		position,
		isAvailable: true,
		employee: { id: name, name, sortOrder: position },
	}));

	render(
		<RoundOverview
			roster={roster}
			totals={
				new Map(
					roster.map((item, index) => [
						item.employeeId,
						{
							employeeId: item.employeeId,
							customersServed: 0,
							roundsEarned: index === 0 ? 2 : 1,
							revenue: "0.00",
						},
					]),
				)
			}
		/>,
	);

	const highlighted = screen
		.getAllByText("Needs round")
		.map((badge) => badge.parentElement?.textContent);
	expect(highlighted).toEqual([
		"B1 roundNeeds round",
		"C1 roundNeeds round",
		"D1 roundNeeds round",
	]);
});

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

it("does not allow a higher-round employee to be set next", () => {
	render(
		<EmployeeCard
			canSetNext={false}
			entry={entry}
			index={0}
			isNext={false}
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

it("records multiple services with independent payment methods", () => {
	const onPay = vi.fn();
	function Harness() {
		const [services, setServices] = useState<ServiceInput[]>([
			{
				id: "service-1",
				serviceName: "Haircut",
				amount: "",
				currency: "EUR",
				method: "CASH",
			},
		]);
		return (
			<PaymentDialog
				onOpenChange={() => undefined}
				onPay={onPay}
				onServicesChange={setServices}
				open
				services={services}
			/>
		);
	}
	render(<Harness />);

	fireEvent.change(screen.getByLabelText("Service 1 amount"), { target: { value: "20.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Add service" }));
	fireEvent.change(screen.getByLabelText("Service 2 amount"), { target: { value: "40.00" } });
	fireEvent.click(screen.getAllByRole("button", { name: "PayPal" })[1]);
	fireEvent.click(screen.getByRole("button", { name: "Finish customer" }));

	expect(onPay).toHaveBeenCalledWith([
		{
			id: "service-1",
			serviceName: "Haircut",
			amount: "20.00",
			currency: "EUR",
			method: "CASH",
		},
		{ serviceName: "", amount: "40.00", currency: "EUR", method: "PAYPAL" },
	]);
});

it("disables completion until every service is valid", () => {
	render(
		<PaymentDialog
			onOpenChange={() => undefined}
			onPay={() => undefined}
			onServicesChange={() => undefined}
			open
			services={[emptyService()]}
		/>,
	);

	expect(screen.getByRole("button", { name: "Finish customer" })).toBeDisabled();
});

it("shows customers, rounds, and revenue separately", () => {
	render(
		<EmployeeCard
			entry={entry}
			index={0}
			isNext={false}
			onAssign={() => undefined}
			onAvailabilityChange={() => undefined}
			onCancel={() => undefined}
			onComplete={() => undefined}
			onSetNext={() => undefined}
			onViewServed={() => undefined}
			total={{
				employeeId: "employee-id",
				customersServed: 1,
				roundsEarned: 2,
				revenue: "90.00",
			}}
		/>,
	);

	expect(screen.getByText("Customers").parentElement).toHaveTextContent("1");
	expect(screen.getByText("Rounds").parentElement).toHaveTextContent("2");
	expect(screen.getByText("Earned").parentElement).toHaveTextContent("€90.00");
});
