import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { ServiceEditor, serviceTotals, type ServiceInput } from "./service-editor";

afterEach(cleanup);

function Harness() {
	const [services, setServices] = useState<ServiceInput[]>([
		{ serviceName: "", amount: "", currency: "EUR", method: "CASH" },
	]);
	return <ServiceEditor services={services} onChange={setServices} />;
}

it("adds and removes service rows while updating totals and rounds", () => {
	render(<Harness />);
	const amount = screen.getByLabelText("Service 1 amount");
	const paymentMethod = screen.getByRole("group", { name: "Service 1 payment method" });
	const name = screen.getByLabelText("Service 1 name");
	expect(amount.compareDocumentPosition(paymentMethod) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(paymentMethod.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
	expect(screen.getByRole("button", { name: "PayPal" })).toHaveAttribute("aria-pressed", "true");
	fireEvent.change(screen.getByLabelText("Service 1 name"), { target: { value: "Haircut" } });
	fireEvent.change(screen.getByLabelText("Service 1 amount"), { target: { value: "20.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Add service" }));
	fireEvent.change(screen.getByLabelText("Service 2 name"), { target: { value: "Color" } });
	fireEvent.change(screen.getByLabelText("Service 2 amount"), { target: { value: "40.00" } });

	expect(screen.getByText("€60.00")).toBeInTheDocument();
	expect(screen.getByText("1 round")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Remove service 2" }));
	expect(screen.getByText("€20.00")).toBeInTheDocument();
	expect(screen.getByText("0 rounds")).toBeInTheDocument();
});

it("uses the strict 30 euro boundary and validates every row", () => {
	expect(serviceTotals([
		{ serviceName: "Cut", amount: "30.00", currency: "EUR", method: "CASH" },
	])).toEqual({ total: "30.00", rounds: 0, valid: true });
	expect(serviceTotals([
		{ serviceName: "Color", amount: "30.01", currency: "EUR", method: "PAYPAL" },
	])).toEqual({ total: "30.01", rounds: 1, valid: true });
	for (const service of [
		{ serviceName: "Cut", amount: "0.00", currency: "EUR", method: "CASH" },
		{ serviceName: "Cut", amount: "bad", currency: "EUR", method: "CASH" },
	] as ServiceInput[]) {
		expect(serviceTotals([service]).valid).toBe(false);
	}
});
