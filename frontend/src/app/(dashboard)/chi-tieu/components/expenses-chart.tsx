"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpenses } from "@/hooks/use-expenses";
import { currentMonth, monthRange } from "@/lib/expense-period";

const DAILY_TARGET = 400;

export function ExpensesChart() {
	const { i18n, t } = useTranslation();
	const [month, setMonth] = useState(currentMonth);
	const query = useExpenses(month);
	const locale = i18n.resolvedLanguage === "vi" ? "vi-VN" : "en-US";
	const currency = useMemo(
		() => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
		[locale],
	);
	const monthOptions = useMemo(() => {
		const [year, monthNumber] = currentMonth().split("-").map(Number);
		const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
		return Array.from({ length: 12 }, (_, offset) => {
			const date = new Date(year, monthNumber - 1 - offset, 1);
			return { value: currentMonth(date), label: formatter.format(date) };
		});
	}, [locale]);
	const chartData = useMemo(() => {
		const totals = new Map<string, number>();
		for (const expense of query.data ?? []) {
			if (expense.currency === "EUR") {
				totals.set(
					expense.spent_at,
					(totals.get(expense.spent_at) ?? 0) + Number(expense.amount),
				);
			}
		}

		const { endDate } = monthRange(month);
		const days = month === currentMonth() ? new Date().getDate() : Number(endDate.slice(-2));
		let monthTotal = 0;
		return Array.from({ length: days }, (_, index) => {
			const day = String(index + 1).padStart(2, "0");
			const date = `${month}-${day}`;
			// eslint-disable-next-line react-hooks/immutability
			monthTotal += totals.get(date) ?? 0;
			return {
				date,
				day: `${day}/${month.slice(5)}`,
				expenses: monthTotal,
				target: DAILY_TARGET,
			};
		});
	}, [month, query.data]);
	const chartConfig = {
		expenses: { label: t("dashboard.sales"), color: "var(--primary)" },
		target: { label: t("dashboard.target"), color: "var(--primary)" },
	} satisfies ChartConfig;

	return (
		<Card className="cursor-pointer">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<div>
					<CardTitle>{t("dashboard.statistics")}</CardTitle>
					<CardDescription>{t("dashboard.comparison")}</CardDescription>
				</div>
				<div className="flex items-center space-x-2">
					<Select value={month} onValueChange={setMonth}>
						<SelectTrigger
							className="w-32 cursor-pointer"
							aria-label={t("dashboard.dailyExpenses.month")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{monthOptions.map((option) => (
									<SelectItem
										key={option.value}
										value={option.value}
										className="cursor-pointer"
									>
										{option.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</CardHeader>
			<CardContent className="p-0 pt-6">
				<div className="px-6 pb-6">
					{query.isPending ? (
						<Skeleton className="h-87.5 w-full" />
					) : query.isError ? (
						<div className="flex h-87.5 flex-col items-center justify-center gap-3 text-center">
							<p className="text-muted-foreground">
								{t("dashboard.dailyExpenses.error")}
							</p>
							<Button variant="outline" onClick={() => void query.refetch()}>
								{t("dashboard.dailyExpenses.retry")}
							</Button>
						</div>
					) : (
						<ChartContainer config={chartConfig} className="h-87.5 w-full">
							<AreaChart
								data={chartData}
								margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
								accessibilityLayer
							>
								<defs>
									<linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="5%"
											stopColor="var(--color-expenses)"
											stopOpacity={0.4}
										/>
										<stop
											offset="95%"
											stopColor="var(--color-expenses)"
											stopOpacity={0.05}
										/>
									</linearGradient>
									<linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="5%"
											stopColor="var(--color-target)"
											stopOpacity={0.2}
										/>
										<stop
											offset="95%"
											stopColor="var(--color-target)"
											stopOpacity={0}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
								<XAxis
									dataKey="day"
									axisLine={false}
									tickLine={false}
									className="text-xs"
									tick={{ fontSize: 12 }}
									minTickGap={16}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									className="text-xs"
									tick={{ fontSize: 12 }}
									width={72}
									tickFormatter={(value) => currency.format(Number(value))}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value, name) => (
												<div className="flex flex-1 justify-between gap-4">
													<span className="text-muted-foreground">
														{chartConfig[
															name as keyof typeof chartConfig
														]?.label ?? name}
													</span>
													<span className="font-mono font-medium tabular-nums">
														{currency.format(Number(value))}
													</span>
												</div>
											)}
										/>
									}
								/>
								<Area
									type="monotone"
									dataKey="target"
									stackId="1"
									stroke="var(--color-target)"
									fill="url(#colorTarget)"
									strokeDasharray="5 5"
									strokeWidth={1}
								/>
								<Area
									type="monotone"
									dataKey="expenses"
									stackId="2"
									stroke="var(--color-expenses)"
									fill="url(#colorExpenses)"
									strokeWidth={1}
								/>
							</AreaChart>
						</ChartContainer>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
