"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	arrayMove,
	sortableKeyboardCoordinates,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Session } from "../workforce";
import { emptyService, ServiceEditor, serviceTotals, type ServiceInput } from "./service-editor";

type ServedCustomerSession = Pick<Session, "id" | "employeeId" | "servedNumber" | "customerName" | "status" | "payments">;
export type ServedCustomerInput = { servedNumber: number; customerName: string; services: ServiceInput[] };

const emptyForm = (servedNumber: number): ServedCustomerInput => ({ servedNumber, customerName: "", services: [emptyService()] });
const toServices = (payments: ServedCustomerSession["payments"]): ServiceInput[] => payments.map((payment) => ({
	serviceName: payment.serviceName,
	amount: payment.amount ?? "",
	currency: "EUR",
	method: payment.method ?? "CASH",
}));

export function reorderedSessionIds(items: { id: string }[], activeId: string, overId: string) {
	const oldIndex = items.findIndex((item) => item.id === activeId);
	const newIndex = items.findIndex((item) => item.id === overId);
	return oldIndex < 0 || newIndex < 0
		? items.map((item) => item.id)
		: arrayMove(items, oldIndex, newIndex).map((item) => item.id);
}

function SortableCustomerRow({ onOpen, selected, session }: {
	onOpen: () => void;
	selected: boolean;
	session: ServedCustomerSession;
}) {
	const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: session.id });
	const totals = serviceTotals(toServices(session.payments));
	return <TableRow
		{...attributes}
		{...listeners}
		aria-expanded={selected}
		className="cursor-grab touch-none active:cursor-grabbing"
		onClick={() => { if (!isDragging) onOpen(); }}
		onKeyDown={(event) => {
			listeners?.onKeyDown?.(event);
			if (event.key === "Enter") onOpen();
		}}
		ref={setNodeRef}
		role="row"
		style={{ opacity: isDragging ? 0.6 : 1, transform: CSS.Transform.toString(transform), transition }}
	>
		<TableCell>{session.servedNumber}</TableCell>
		<TableCell>{session.customerName || "Walk-in customer"}</TableCell>
		<TableCell>€{totals.total}</TableCell>
		<TableCell>{totals.rounds}</TableCell>
	</TableRow>;
}

export function ServedCustomersDialog({ employee, onCreate, onDelete, onOpenChange, onReorder, onUpdate, open, sessions }: {
	employee: { id: string; name: string };
	onCreate: (input: ServedCustomerInput) => unknown | Promise<unknown>;
	onDelete: (id: string) => unknown | Promise<unknown>;
	onOpenChange: (open: boolean) => void;
	onReorder: (sessionIds: string[]) => unknown | Promise<unknown>;
	onUpdate: (id: string, input: ServedCustomerInput) => unknown | Promise<unknown>;
	open: boolean;
	sessions: ServedCustomerSession[];
}) {
	const data = useMemo(() => [...sessions]
		.filter((session) => session.employeeId === employee.id && session.status === "PAID" && session.payments[0])
		.sort((a, b) => a.servedNumber - b.servedNumber), [employee.id, sessions]);
	const nextNumber = (data[data.length - 1]?.servedNumber ?? 0) + 1;
	const [newCustomer, setNewCustomer] = useState(() => emptyForm(nextNumber));
	const [createOpen, setCreateOpen] = useState(false);
	const [actionId, setActionId] = useState<string | null>(null);
	const [editing, setEditing] = useState<ServedCustomerInput | null>(null);
	const selected = data.find((session) => session.id === actionId) ?? null;
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	function reorderCustomers({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		void onReorder(reorderedSessionIds(data, String(active.id), String(over.id)));
	}

	async function addCustomer(event: FormEvent) {
		event.preventDefault();
		if (!newCustomer.servedNumber || !serviceTotals(newCustomer.services).valid) return;
		const result = await onCreate(newCustomer);
		if (result !== false && result !== null) {
			setNewCustomer(emptyForm(nextNumber + 1));
			setCreateOpen(false);
		}
	}
	async function saveCustomer() {
		if (!selected || !editing) return;
		const result = await onUpdate(selected.id, editing);
		if (result !== false && result !== null) {
			setEditing(null);
			setActionId(null);
		}
	}
	async function deleteCustomer() {
		if (!selected || !window.confirm("Delete this served customer?")) return;
		const result = await onDelete(selected.id);
		if (result !== false && result !== null) setActionId(null);
	}
	function closeCustomer() {
		setActionId(null);
		setEditing(null);
	}

	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent aria-describedby={undefined} className="sm:max-w-4xl">
			<DialogHeader><DialogTitle>{employee.name}</DialogTitle></DialogHeader>
			<DndContext collisionDetection={closestCenter} onDragEnd={reorderCustomers} sensors={sensors}>
			<Table>
				<TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Customer</TableHead><TableHead>Total</TableHead><TableHead>Rounds</TableHead></TableRow></TableHeader>
				<SortableContext items={data.map((session) => session.id)} strategy={verticalListSortingStrategy}>
					<TableBody>{data.length ? data.map((session) => <SortableCustomerRow key={session.id} onOpen={() => setActionId(session.id)} selected={actionId === session.id} session={session} />) : <TableRow><TableCell colSpan={4} className="h-24 text-center">No customers served yet.</TableCell></TableRow>}</TableBody>
				</SortableContext>
			</Table>
			</DndContext>
			<div className="flex justify-end"><Button onClick={() => setCreateOpen(true)}>Add customer</Button></div>

			<Dialog open={Boolean(selected)} onOpenChange={(isOpen) => { if (!isOpen) closeCustomer(); }}>
				{selected ? <DialogContent aria-describedby={undefined}>
					<DialogHeader><DialogTitle>Customer {selected.servedNumber}</DialogTitle></DialogHeader>
					{editing ? <div className="grid gap-4">
						<Input aria-label="Customer number" min={1} onChange={(event) => setEditing({ ...editing, servedNumber: Number(event.target.value) })} type="number" value={editing.servedNumber} />
						<Input aria-label="Customer name" onChange={(event) => setEditing({ ...editing, customerName: event.target.value })} placeholder="Walk-in customer" value={editing.customerName} />
						<ServiceEditor services={editing.services} onChange={(services) => setEditing({ ...editing, services })} />
						<div className="flex justify-end gap-2"><Button onClick={() => setEditing(null)} variant="outline">Cancel</Button><Button disabled={!serviceTotals(editing.services).valid} onClick={() => void saveCustomer()}>Save customer</Button></div>
					</div> : <>
						<div className="grid gap-2 text-sm">{selected.payments.map((payment, index) => <div className="grid grid-cols-[1fr_auto_auto] gap-3" key={payment.id}><span>{payment.serviceName || `Service ${index + 1}`}</span><span>€{payment.amount}</span><span>{payment.method === "PAYPAL" ? "PayPal" : "Cash"}</span></div>)}</div>
						<div className="flex justify-end gap-2"><Button aria-label={`Delete ${selected.customerName || "Walk-in customer"}`} onClick={() => void deleteCustomer()} variant="destructive">Delete</Button><Button aria-label={`Edit ${selected.customerName || "Walk-in customer"}`} onClick={() => setEditing({ servedNumber: selected.servedNumber, customerName: selected.customerName ?? "", services: toServices(selected.payments) })}>Edit</Button></div>
					</>}
				</DialogContent> : null}
			</Dialog>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent aria-describedby={undefined}>
					<DialogHeader><DialogTitle>Add served customer</DialogTitle></DialogHeader>
					<form className="grid gap-4" onSubmit={addCustomer}>
						<Input aria-label="New customer number" min={1} onChange={(event) => setNewCustomer({ ...newCustomer, servedNumber: Number(event.target.value) })} type="number" value={newCustomer.servedNumber} />
						<Input aria-label="New customer name" onChange={(event) => setNewCustomer({ ...newCustomer, customerName: event.target.value })} placeholder="Walk-in customer" value={newCustomer.customerName} />
						<ServiceEditor services={newCustomer.services} onChange={(services) => setNewCustomer({ ...newCustomer, services })} />
						<div className="flex justify-end gap-2"><Button onClick={() => setCreateOpen(false)} type="button" variant="outline">Cancel</Button><Button disabled={!serviceTotals(newCustomer.services).valid} type="submit">Add customer</Button></div>
					</form>
				</DialogContent>
			</Dialog>
		</DialogContent>
	</Dialog>;
}
