import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { reorderedSessionIds, ServedCustomersDialog } from "./served-customers-dialog";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const sessions = [
	{
		id: "second",
		employeeId: "employee-id",
		servedNumber: 2,
		customerName: "Mai",
		status: "PAID" as const,
		payments: [{ amount: "20.00", currency: "EUR", method: "CASH" as const }],
	},
	{
		id: "first",
		employeeId: "employee-id",
		servedNumber: 1,
		customerName: "Lan",
		status: "PAID" as const,
		payments: [{ amount: "10.00", currency: "EUR", method: "PAYPAL" as const }],
	},
];

it("creates, edits, and deletes numbered served customers", async () => {
	const onCreate = vi.fn();
	const onUpdate = vi.fn();
	const onDelete = vi.fn();
	vi.spyOn(window, "confirm").mockReturnValue(true);

	render(
		<ServedCustomersDialog
			employee={{ id: "employee-id", name: "Anna" }}
			onCreate={onCreate}
			onDelete={onDelete}
				onOpenChange={() => undefined}
				onReorder={() => undefined}
				onUpdate={onUpdate}
			open
			sessions={sessions}
		/>,
	);

	expect(screen.getAllByRole("row")[1]).toHaveTextContent("Lan");
	expect(screen.queryByLabelText("New customer name")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	fireEvent.change(screen.getByLabelText("New customer number"), {
		target: { value: "3" },
	});
	fireEvent.change(screen.getByLabelText("New customer name"), {
		target: { value: "Hoa" },
	});
	fireEvent.change(screen.getByLabelText("New customer amount"), {
		target: { value: "30.50" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	expect(onCreate).toHaveBeenCalledWith({
		servedNumber: 3,
		customerName: "Hoa",
		amount: "30.50",
		method: "CASH",
	});

	const lanRow = await screen.findByRole("row", { name: /1 Lan/ });
	expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Edit Lan" })).not.toBeInTheDocument();
	fireEvent.click(lanRow);
	expect(await screen.findByRole("dialog", { name: "Customer 1" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Edit Lan" }));
	fireEvent.change(screen.getByLabelText("Customer number"), {
		target: { value: "2" },
	});
	fireEvent.change(screen.getByLabelText("Customer name"), {
		target: { value: "Lan Anh" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save customer" }));
	expect(onUpdate).toHaveBeenCalledWith("first", {
		servedNumber: 2,
		customerName: "Lan Anh",
		amount: "10.00",
		method: "PAYPAL",
	});

	fireEvent.click(await screen.findByRole("row", { name: /2 Mai/ }));
	expect(await screen.findByRole("dialog", { name: "Customer 2" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Delete Mai" }));
	expect(onDelete).toHaveBeenCalledWith("second");
});

it("keeps entered values when creating a served customer fails", async () => {
	render(
		<ServedCustomersDialog
			employee={{ id: "employee-id", name: "Anna" }}
			onCreate={() => false}
			onDelete={() => undefined}
				onOpenChange={() => undefined}
				onReorder={() => undefined}
				onUpdate={() => undefined}
			open
			sessions={sessions}
		/>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	const name = screen.getByLabelText("New customer name");
	fireEvent.change(name, { target: { value: "Hoa" } });
	fireEvent.change(screen.getByLabelText("New customer amount"), {
		target: { value: "30.50" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));

	await act(() => Promise.resolve());
	expect(name).toHaveValue("Hoa");
});

it("builds the persisted order after moving a customer row", () => {
	expect(reorderedSessionIds([sessions[1], sessions[0]], "first", "second")).toEqual(["second", "first"]);
});
