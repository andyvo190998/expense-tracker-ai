import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
		payments: [
			{
				id: "payment-3",
				serviceName: "Nails",
				amount: "20.00",
				currency: "EUR",
				method: "CASH" as const,
			},
		],
	},
	{
		id: "first",
		employeeId: "employee-id",
		servedNumber: 1,
		customerName: "Lan",
		status: "PAID" as const,
		payments: [
			{
				id: "payment-1",
				serviceName: "Haircut",
				amount: "20.00",
				currency: "EUR",
				method: "CASH" as const,
			},
			{
				id: "payment-2",
				serviceName: "Color",
				amount: "40.00",
				currency: "EUR",
				method: "PAYPAL" as const,
			},
		],
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
	expect(screen.queryByLabelText("New customer number")).not.toBeInTheDocument();
	expect(screen.queryByLabelText("New customer name")).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Service 1 name"), {
		target: { value: "Haircut" },
	});
	fireEvent.change(screen.getByLabelText("Service 1 amount"), {
		target: { value: "20.00" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add service" }));
	fireEvent.change(screen.getByLabelText("Service 2 name"), { target: { value: "Color" } });
	fireEvent.change(screen.getByLabelText("Service 2 amount"), { target: { value: "40.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	expect(onCreate).toHaveBeenCalledWith({
		servedNumber: 3,
		customerName: "",
		services: [
			{ serviceName: "Haircut", amount: "20.00", currency: "EUR", method: "CASH" },
			{ serviceName: "Color", amount: "40.00", currency: "EUR", method: "CASH" },
		],
	});
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

	const lanRow = await screen.findByRole("row", { name: /1 Lan/ });
	expect(lanRow).toHaveTextContent("€60.00");
	expect(lanRow).toHaveTextContent("1");
	expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Edit Lan" })).not.toBeInTheDocument();
	fireEvent.click(lanRow);
	expect(await screen.findByRole("dialog", { name: "Customer 1" })).toBeInTheDocument();
	expect(screen.getByText("Haircut")).toBeInTheDocument();
	expect(screen.getByText("Color")).toBeInTheDocument();
	expect(screen.getByText("PayPal")).toBeInTheDocument();
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
		services: [
			{ serviceName: "Haircut", amount: "20.00", currency: "EUR", method: "CASH" },
			{ serviceName: "Color", amount: "40.00", currency: "EUR", method: "PAYPAL" },
		],
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
	expect(screen.queryByLabelText("New customer name")).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Service 1 name"), {
		target: { value: "Haircut" },
	});
	fireEvent.change(screen.getByLabelText("Service 1 amount"), {
		target: { value: "30.50" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));

	await act(() => Promise.resolve());
	expect(screen.getByLabelText("Service 1 name")).toHaveValue("Haircut");
});

it("stays open and resets for another served customer after a successful create", async () => {
	const onCreate = vi.fn().mockResolvedValue(true);
	render(
		<ServedCustomersDialog
			employee={{ id: "employee-id", name: "Anna" }}
			onCreate={onCreate}
			onDelete={() => undefined}
			onOpenChange={() => undefined}
			onReorder={() => undefined}
			onUpdate={() => undefined}
			open
			sessions={sessions}
		/>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	fireEvent.change(screen.getByLabelText("Service 1 amount"), { target: { value: "20.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
	const dialog = screen.getByRole("dialog", { name: "Add served customer" });
	expect(dialog).toHaveClass("max-h-[90vh]", "overflow-y-auto");
	expect(screen.getByLabelText("Service 1 amount")).toHaveValue(null);
	expect(screen.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "true");

	fireEvent.change(screen.getByLabelText("Service 1 amount"), { target: { value: "25.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
	await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
	expect(onCreate.mock.calls.map(([input]) => input.servedNumber)).toEqual([3, 4]);
});

it("builds the persisted order after moving a customer row", () => {
	expect(reorderedSessionIds([sessions[1], sessions[0]], "first", "second")).toEqual([
		"second",
		"first",
	]);
});
