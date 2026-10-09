"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import {
	ServedCustomersDialog,
	type ServedCustomerInput,
} from "./components/served-customers-dialog";
import {
	CancelServiceDialog,
	EmployeeCard,
	EmployeesCard,
	PageHeader,
	PaymentDialog,
	QuickAssignDialog,
	StartWorkDayDialog,
	TodayTotal,
} from "./components/workday-components";
import {
	api,
	type Employee,
	nextEmployeeId,
	type PaymentMethod,
	type RosterItem,
	type Session,
	type Summary,
	type WorkDay,
} from "./workforce";

export default function ChiaLuotPage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [customerName, setCustomerName] = useState("");
	const [startOpen, setStartOpen] = useState(false);
	const [roster, setRoster] = useState<RosterItem[]>([]);
	const [paymentSession, setPaymentSession] = useState<Session | null>(null);
	const [cancelSession, setCancelSession] = useState<Session | null>(null);
	const [quickAssignEmployee, setQuickAssignEmployee] = useState<Employee | null>(null);
	const [servedEmployee, setServedEmployee] = useState<Employee | null>(null);
	const [amount, setAmount] = useState("");
	const [method, setMethod] = useState<PaymentMethod>("CASH");
	const [, tick] = useState(0);
	const queryKey = ["workforce", user?.id ?? "visitor"] as const;
	const employeesQuery = useQuery({
		queryKey: [...queryKey, "employees"],
		queryFn: () => api<Employee[]>("employees"),
	});
	const dayQuery = useQuery({
		queryKey: [...queryKey, "current-day"],
		queryFn: () => api<WorkDay | null>("work-days/current"),
	});
	const employees = employeesQuery.data ?? [];
	const day = dayQuery.data ?? null;
	const summaryQuery = useQuery({
		queryKey: [...queryKey, "summary", day?.id],
		queryFn: () => api<Summary>(`work-days/${day!.id}/summary`),
		enabled: Boolean(day),
	});
	const summary = summaryQuery.data ?? null;
	const mutation = useMutation({
		mutationFn: ({ path, init }: { path: string; init: RequestInit }) =>
			api<unknown>(path, init),
		onSuccess: () => queryClient.invalidateQueries({ queryKey }),
		onError: (error) => toast.error(error instanceof Error ? error.message : "Request failed"),
	});

	useEffect(() => {
		const timer = window.setInterval(() => tick((value) => value + 1), 1000);
		return () => window.clearInterval(timer);
	}, []);
	const activeByEmployee = useMemo(
		() =>
			new Map(
				day?.sessions
					.filter((session) => session.status === "IN_PROGRESS")
					.map((session) => [session.employeeId, session]) ?? [],
			),
		[day],
	);
	const nextEmployee = useMemo(
		() =>
			day
				? nextEmployeeId(day.roster, day.nextPosition, new Set(activeByEmployee.keys()))
				: undefined,
		[activeByEmployee, day],
	);
	const totals = useMemo(
		() => new Map(summary?.employees.map((item) => [item.employeeId, item]) ?? []),
		[summary],
	);

	async function mutate<T = unknown>(path: string, init: RequestInit) {
		try {
			return (await mutation.mutateAsync({ path, init })) as T;
		} catch {
			return null;
		}
	}
	async function addEmployee() {
		if (!name.trim()) return;
		if (
			await mutate("employees", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name }),
			})
		) {
			setName("");
			toast.success("Employee added");
		}
	}
	function openStart() {
		setRoster(
			employees.map((employee) => ({
				employeeId: employee.id,
				name: employee.name,
				isAvailable: true,
			})),
		);
		setStartOpen(true);
	}
	function move(index: number, direction: -1 | 1) {
		setRoster((items) => {
			const target = index + direction;
			if (target < 0 || target >= items.length) return items;
			const next = [...items];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	}
	async function startDay() {
		const businessDate = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Europe/Berlin",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date());
		if (
			await mutate("work-days", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					businessDate,
					employees: roster.map(({ employeeId, isAvailable }) => ({
						employeeId,
						isAvailable,
						unavailableReason: isAvailable ? undefined : "Vacation",
					})),
				}),
			})
		)
			setStartOpen(false);
	}
	async function assign(employeeId?: string, description = customerName) {
		if (!day) return;
		const result = await mutate<Session>(`work-days/${day.id}/assignments`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ customerName: description || undefined, employeeId }),
		});
		if (result) {
			if (!employeeId) setCustomerName("");
			toast.success(`Assigned to ${result.employee.name}`);
			return true;
		}
		return false;
	}
	function complete(session: Session) {
		setPaymentSession(session);
		setAmount("");
	}
	async function pay() {
		if (
			paymentSession &&
			amount &&
			(await mutate(`sessions/${paymentSession.id}/payments`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ amount, method, currency: "EUR" }),
			}))
		) {
			setPaymentSession(null);
			toast.success("Payment recorded");
		}
	}
	async function removeSession() {
		if (cancelSession && (await mutate(`sessions/${cancelSession.id}`, { method: "DELETE" }))) {
			setCancelSession(null);
			toast.success("Service deleted");
		}
	}
	async function createServedCustomer(input: ServedCustomerInput) {
		if (!day || !servedEmployee) return false;
		const result = await mutate(`work-days/${day.id}/served-customers`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...input, employeeId: servedEmployee.id, currency: "EUR" }),
		});
		if (result) toast.success("Served customer added");
		return Boolean(result);
	}
	async function updateServedCustomer(id: string, input: ServedCustomerInput) {
		const result = await mutate(`sessions/${id}/served-customer`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		if (result) toast.success("Served customer updated");
		return Boolean(result);
	}
	async function deleteServedCustomer(id: string) {
		const result = await mutate(`sessions/${id}/served-customer`, { method: "DELETE" });
		if (result) toast.success("Served customer deleted");
		return Boolean(result);
	}
	async function reorderServedCustomers(sessionIds: string[]) {
		if (!day || !servedEmployee) return false;
		const result = await mutate(`work-days/${day.id}/served-customers/order`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ employeeId: servedEmployee.id, sessionIds }),
		});
		if (result) toast.success("Served customers reordered");
		return Boolean(result);
	}
	async function closeDay() {
		if (day && (await mutate(`work-days/${day.id}/close`, { method: "POST" })))
			toast.success("Workday closed; tomorrow's order is rotated");
	}

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8">
			<PageHeader
				hasEmployees={Boolean(employees.length)}
				isOpen={Boolean(day)}
				onStart={openStart}
			/>
			{!day ? (
				<EmployeesCard
					employees={employees}
					name={name}
					onAdd={() => void addEmployee()}
					onNameChange={setName}
				/>
			) : (
				<>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{day.roster.map((entry, index) => (
							<EmployeeCard
								key={entry.employeeId}
								active={activeByEmployee.get(entry.employeeId)}
								entry={entry}
								index={index}
								isNext={entry.employeeId === nextEmployee}
								onAssign={() => setQuickAssignEmployee(entry.employee)}
								onAvailabilityChange={(isAvailable) =>
									void mutate(
										`work-days/${day.id}/employees/${entry.employeeId}`,
										{
											method: "PATCH",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({
												isAvailable,
												unavailableReason: isAvailable
													? undefined
													: "Vacation",
											}),
										},
									)
								}
								onCancel={setCancelSession}
								onComplete={complete}
								onSetNext={() =>
									void mutate(
										`work-days/${day.id}/next-employee/${entry.employeeId}`,
										{ method: "PATCH" },
									)
								}
								onViewServed={setServedEmployee}
								total={totals.get(entry.employeeId)}
							/>
						))}
					</div>
					<TodayTotal
						cashTotal={summary?.cashTotal ?? "0.00"}
						onClose={() => void closeDay()}
						paypalTotal={summary?.paypalTotal ?? "0.00"}
						total={summary?.total ?? "0.00"}
					/>
				</>
			)}
			<StartWorkDayDialog
				onAvailabilityChange={(employeeId, isAvailable) =>
					setRoster((items) =>
						items.map((item) =>
							item.employeeId === employeeId ? { ...item, isAvailable } : item,
						),
					)
				}
				onMove={move}
				onOpenChange={setStartOpen}
				onStart={() => void startDay()}
				open={startOpen}
				roster={roster}
			/>
			<PaymentDialog
				amount={amount}
				method={method}
				onAmountChange={setAmount}
				onMethodChange={setMethod}
				onOpenChange={(open) => !open && setPaymentSession(null)}
				onPay={() => void pay()}
				open={Boolean(paymentSession)}
			/>
			{cancelSession ? (
				<CancelServiceDialog
					onConfirm={() => void removeSession()}
					onOpenChange={(open) => !open && setCancelSession(null)}
					open
					session={cancelSession}
				/>
			) : null}
			{quickAssignEmployee ? (
				<QuickAssignDialog
					employee={quickAssignEmployee}
					onConfirm={(description) =>
						void assign(quickAssignEmployee.id, description).then((assigned) => {
							if (assigned) setQuickAssignEmployee(null);
						})
					}
					onOpenChange={(open) => !open && setQuickAssignEmployee(null)}
					open
				/>
			) : null}
			{servedEmployee ? (
				<ServedCustomersDialog
					employee={servedEmployee}
					onCreate={createServedCustomer}
					onDelete={deleteServedCustomer}
					onOpenChange={(open) => !open && setServedEmployee(null)}
					onReorder={reorderServedCustomers}
					onUpdate={updateServedCustomer}
					open
					sessions={day?.sessions ?? []}
				/>
			) : null}
		</div>
	);
}
