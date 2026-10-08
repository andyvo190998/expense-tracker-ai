"use client";

import { useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { Session } from "../workforce";

type ServedCustomerSession = Pick<
	Session,
	"id" | "employeeId" | "customerName" | "status" | "payments"
>;

type ServedCustomer = {
	description: string;
	amount: string;
	method: "CASH" | "PAYPAL";
};

const columns: ColumnDef<ServedCustomer>[] = [
	{
		id: "number",
		header: "No.",
		cell: ({ row }) => row.index + 1,
	},
	{ accessorKey: "description", header: "Customer" },
	{
		accessorKey: "amount",
		header: () => <div className="text-right">Money</div>,
		cell: ({ row }) => <div className="text-right">€{row.original.amount}</div>,
	},
	{
		accessorKey: "method",
		header: "Method",
		cell: ({ row }) => (row.original.method === "PAYPAL" ? "PayPal" : "Cash"),
	},
];

export function ServedCustomersDialog({
	employee,
	onOpenChange,
	open,
	sessions,
}: {
	employee: { id: string; name: string };
	onOpenChange: (open: boolean) => void;
	open: boolean;
	sessions: ServedCustomerSession[];
}) {
	const data = useMemo(
		() =>
			sessions.flatMap((session) =>
				session.employeeId === employee.id &&
				session.status === "PAID" &&
				session.payments[0]
					? [
							{
								description: session.customerName || "Walk-in customer",
								amount: session.payments[0].amount,
								method: session.payments[0].method,
							},
						]
					: [],
			),
		[employee.id, sessions],
	);
	// eslint-disable-next-line react-hooks/incompatible-library
	const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{employee.name}</DialogTitle>
				</DialogHeader>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-24 text-center">
									No customers served yet.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</DialogContent>
		</Dialog>
	);
}
