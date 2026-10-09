"use client";

import { useState } from "react";
import Image from "next/image";
import {
	ArrowDown,
	ArrowUp,
	Banknote,
	Check,
	CircleX,
	Clock3,
	Play,
	Plus,
	Users,
} from "lucide-react";
import paypalImage from "@/assets/paypal.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	elapsed,
	type Employee,
	type EmployeeSummary,
	type PaymentMethod,
	type RosterItem,
	type Session,
	type WorkDay,
} from "../workforce";

export function QuickAssignDialog({
	employee,
	onConfirm,
	onOpenChange,
	open,
}: {
	employee: Employee;
	onConfirm: (description: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [description, setDescription] = useState("");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Assign customer to {employee.name}?</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="quick-customer-description">Customer description</Label>
					<Input
						id="quick-customer-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Optional"
					/>
				</div>
				<DialogFooter>
					<Button onClick={() => onConfirm(description)}>Confirm assignment</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function CancelServiceDialog({
	onConfirm,
	onOpenChange,
	open,
	session,
}: {
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	session: Session;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Cancel this service?</DialogTitle>
					<DialogDescription>
						{session.employee.name}
						{session.customerName
							? ` is serving ${session.customerName}`
							: " is serving a customer"}
						. This permanently deletes the service.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Keep service
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						<CircleX /> Delete service
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function PageHeader({
	hasEmployees,
	isOpen,
	onStart,
}: {
	hasEmployees: boolean;
	isOpen: boolean;
	onStart: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 className="text-2xl font-semibold">Employee Rotation</h1>
				<p className="text-sm text-muted-foreground">
					Fixed order, fair turns, live service time.
				</p>
			</div>
			{isOpen ? (
				<Badge className="gap-1">
					<Play className="size-3" /> Workday open
				</Badge>
			) : (
				<Button onClick={onStart} disabled={!hasEmployees}>
					<Play /> Start working day
				</Button>
			)}
		</div>
	);
}

export function EmployeesCard({
	employees,
	name,
	onAdd,
	onNameChange,
}: {
	employees: Employee[];
	name: string;
	onAdd: () => void;
	onNameChange: (name: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Employees</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex max-w-md gap-2">
					<Input
						value={name}
						onChange={(event) => onNameChange(event.target.value)}
						placeholder="Employee name"
						onKeyDown={(event) => event.key === "Enter" && onAdd()}
					/>
					<Button onClick={onAdd}>
						<Plus /> Add
					</Button>
				</div>
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{employees.map((employee, index) => (
						<div key={employee.id} className="rounded-lg border p-4">
							<span className="mr-3 text-muted-foreground">{index + 1}</span>
							{employee.name}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export function EmployeeCard({
	active,
	entry,
	index,
	isNext,
	onAssign,
	onAvailabilityChange,
	onCancel,
	onComplete,
	onSetNext,
	onViewServed,
	total,
}: {
	active?: Session;
	entry: WorkDay["roster"][number];
	index: number;
	isNext: boolean;
	onAssign: () => void;
	onAvailabilityChange: (isAvailable: boolean) => void;
	onCancel: (session: Session) => void;
	onComplete: (session: Session) => void;
	onSetNext: () => void;
	onViewServed: (employee: Employee) => void;
	total?: EmployeeSummary;
}) {
	return (
		<Card
			className={
				!entry.isAvailable
					? "opacity-55"
					: active
						? "border-success ring-2 ring-success/20"
						: isNext
							? "ring-2 ring-primary"
							: ""
			}
		>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg">
						{index + 1}. {entry.employee.name}
					</CardTitle>
					<Switch
						aria-label={`${entry.employee.name} availability`}
						checked={entry.isAvailable}
						onCheckedChange={onAvailabilityChange}
					/>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-center justify-between text-sm">
					<span>
						{entry.isAvailable ? (active ? "Serving" : "Available") : "Vacation"}
					</span>
					<div className="flex items-center gap-2">
						{isNext ? <Badge variant="outline">Next turn</Badge> : null}
						<Switch
							aria-label={`Set ${entry.employee.name} as next turn`}
							checked={isNext}
							disabled={isNext || !entry.isAvailable || Boolean(active)}
							onCheckedChange={(checked) => {
								if (checked) onSetNext();
							}}
						/>
					</div>
				</div>
				{active ? (
					<>
						<div className="flex items-center gap-2 font-mono text-xl">
							<Clock3 className="size-5" />
							{elapsed(active.startedAt)}
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" onClick={() => onCancel(active)}>
								<CircleX /> Cancel service
							</Button>
							<Button onClick={() => onComplete(active)}>
								<Check /> Finish service
							</Button>
						</div>
					</>
				) : entry.isAvailable ? (
					<Button className="h-16 w-full" variant="outline" onClick={onAssign}>
						<Users /> Quick assign
					</Button>
				) : (
					<div className="h-16 rounded-md bg-muted/50" />
				)}
				<div className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
					<Button
						variant="ghost"
						className="h-auto justify-start p-0"
						aria-label={`View ${entry.employee.name}'s served customers`}
						onClick={() => onViewServed(entry.employee)}
					>
						<span className="text-left">
							<span className="block text-muted-foreground">Customers</span>
							<strong className="block underline underline-offset-4">
								{total?.customersServed ?? 0}
							</strong>
						</span>
					</Button>
					<div>
						<div className="text-muted-foreground">Earned</div>
						<strong>€{total?.revenue ?? "0.00"}</strong>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function TodayTotal({
	cashTotal,
	onClose,
	paypalTotal,
	total,
}: {
	cashTotal: string;
	onClose: () => void;
	paypalTotal: string;
	total: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Banknote /> Today total
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap items-end justify-between gap-6">
					<div className="grid basis-full grid-cols-2 gap-4 sm:basis-auto sm:grid-cols-3">
						<div>
							<div className="text-sm text-muted-foreground">Cash</div>
							<strong className="text-xl">€{cashTotal}</strong>
						</div>
						<div>
							<div className="text-sm text-muted-foreground flex gap-2">
								<Image src={paypalImage} alt="" className="size-4" /> PayPal
							</div>
							<strong className="text-xl">€{paypalTotal}</strong>
						</div>
						<div className="col-span-2 sm:col-span-1">
							<div className="text-sm text-muted-foreground">Total</div>
							<strong className="text-3xl">€{total}</strong>
						</div>
					</div>
					<Button className="w-full sm:w-auto" variant="outline" onClick={onClose}>
						Close working day
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export function StartWorkDayDialog({
	onAvailabilityChange,
	onMove,
	onOpenChange,
	onStart,
	open,
	roster,
}: {
	onAvailabilityChange: (employeeId: string, isAvailable: boolean) => void;
	onMove: (index: number, direction: -1 | 1) => void;
	onOpenChange: (open: boolean) => void;
	onStart: () => void;
	open: boolean;
	roster: RosterItem[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirm today&apos;s order</DialogTitle>
				</DialogHeader>
				<div className="flex max-h-[55vh] flex-col gap-2 overflow-auto">
					{roster.map((item, index) => (
						<div
							key={item.employeeId}
							className="flex items-center gap-2 rounded-md border p-3"
						>
							<span className="w-6 text-muted-foreground">{index + 1}</span>
							<span className="flex-1">{item.name}</span>
							<Switch
								checked={item.isAvailable}
								onCheckedChange={(isAvailable) =>
									onAvailabilityChange(item.employeeId, isAvailable)
								}
							/>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Move up"
								disabled={!index}
								onClick={() => onMove(index, -1)}
							>
								<ArrowUp />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Move down"
								disabled={index === roster.length - 1}
								onClick={() => onMove(index, 1)}
							>
								<ArrowDown />
							</Button>
						</div>
					))}
				</div>
				<DialogFooter>
					<Button onClick={onStart}>
						<Play /> Start day
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function PaymentDialog({
	amount,
	method,
	onAmountChange,
	onMethodChange,
	onOpenChange,
	onPay,
	open,
}: {
	amount: string;
	method: PaymentMethod;
	onAmountChange: (amount: string) => void;
	onMethodChange: (method: PaymentMethod) => void;
	onOpenChange: (open: boolean) => void;
	onPay: () => void;
	open: boolean;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record payment</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="amount">Amount (EUR)</Label>
						<Input
							id="amount"
							inputMode="decimal"
							value={amount}
							onChange={(event) => onAmountChange(event.target.value)}
							placeholder="0.00"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Method</Label>
						<div className="grid grid-cols-2 gap-3">
							<Button
								type="button"
								variant={method === "CASH" ? "default" : "outline"}
								aria-pressed={method === "CASH"}
								onClick={() => onMethodChange("CASH")}
							>
								<Banknote /> Cash
							</Button>
							<Button
								type="button"
								variant={method === "PAYPAL" ? "default" : "outline"}
								aria-pressed={method === "PAYPAL"}
								onClick={() => onMethodChange("PAYPAL")}
							>
								<Image src={paypalImage} alt="" className="size-4" /> PayPal
							</Button>
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onPay}>
						<Banknote /> Record payment
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
