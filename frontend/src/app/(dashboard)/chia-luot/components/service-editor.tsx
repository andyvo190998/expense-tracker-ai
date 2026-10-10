"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { PaymentMethod } from "../workforce";

export type ServiceInput = {
	id?: string;
	serviceName: string;
	amount: string;
	currency: "EUR";
	method: PaymentMethod;
};

export const emptyService = (): ServiceInput => ({
	serviceName: "",
	amount: "",
	currency: "EUR",
	method: "CASH",
});

function amountInCents(amount: string) {
	if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) return null;
	const [euros, fraction = ""] = amount.split(".");
	const cents = Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
	return cents > 0 ? cents : null;
}

export function serviceTotals(services: ServiceInput[]) {
	let cents = 0;
	let rounds = 0;
	let valid = services.length > 0;
	for (const service of services) {
		const amount = amountInCents(service.amount);
		if (amount === null || service.currency !== "EUR") valid = false;
		if (amount !== null) {
			cents += amount;
			if (amount > 3000) rounds++;
		}
	}
	return { total: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`, rounds, valid };
}

export function ServiceEditor({
	services,
	onChange,
	lockNames = false,
}: {
	services: ServiceInput[];
	onChange: (services: ServiceInput[]) => void;
	lockNames?: boolean;
}) {
	const totals = serviceTotals(services);
	function update(index: number, patch: Partial<ServiceInput>) {
		onChange(services.map((service, position) => position === index ? { ...service, ...patch } : service));
	}

	return (
		<div className="grid gap-4">
			{services.map((service, index) => (
				<div className={`grid gap-2 ${lockNames ? "sm:grid-cols-[1fr_8rem_13rem]" : "sm:grid-cols-[1fr_8rem_8rem_auto]"}`} key={service.id ?? index}>
					{lockNames ? (
						<div className="flex items-center rounded-md border bg-muted/40 px-3 text-sm">
							{service.serviceName || `Service ${index + 1}`}
						</div>
					) : (
						<Input
							aria-label={`Service ${index + 1} name`}
							placeholder="Service name (optional)"
							value={service.serviceName}
							onChange={(event) => update(index, { serviceName: event.target.value })}
						/>
					)}
					<Input
						aria-label={`Service ${index + 1} amount`}
						min="0.01"
						placeholder="0.00"
						step="0.01"
						type="number"
						value={service.amount}
						onChange={(event) => update(index, { amount: event.target.value })}
					/>
					{lockNames ? (
						<div className="grid grid-cols-2 gap-2" aria-label={`Service ${index + 1} payment method`} role="group">
							{(["CASH", "PAYPAL"] as const).map((method) => (
								<Button
									aria-pressed={service.method === method}
									key={method}
									onClick={() => update(index, { method })}
									type="button"
									variant={service.method === method ? "default" : "outline"}
								>
									{method === "CASH" ? "Cash" : "PayPal"}
								</Button>
							))}
						</div>
					) : (
						<Select
							value={service.method}
							onValueChange={(method: PaymentMethod) => update(index, { method })}
						>
							<SelectTrigger aria-label={`Service ${index + 1} payment method`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="CASH">Cash</SelectItem>
								<SelectItem value="PAYPAL">PayPal</SelectItem>
							</SelectContent>
						</Select>
					)}
					{!lockNames ? <Button
						aria-label={`Remove service ${index + 1}`}
						disabled={services.length === 1}
						onClick={() => onChange(services.filter((_, position) => position !== index))}
						size="icon"
						type="button"
						variant="ghost"
					>
						<Trash2 />
					</Button> : null}
				</div>
			))}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Button onClick={() => onChange([...services, emptyService()])} type="button" variant="outline">
					<Plus /> Add service
				</Button>
				<div className="text-right text-sm">
					<div>Total: <span className="font-medium">€{totals.total}</span></div>
					<div>{totals.rounds} {totals.rounds === 1 ? "round" : "rounds"}</div>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">€30.00 or less = 0 rounds; over €30.00 = 1 round.</p>
		</div>
	);
}
