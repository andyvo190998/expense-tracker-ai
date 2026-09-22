"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

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
import { useCategoryExpenses } from "@/hooks/use-category-expenses";
import { currentMonth } from "@/lib/expense-period";

export function RevenueBreakdown() {
	const { i18n, t } = useTranslation();
	const [month, setMonth] = React.useState(currentMonth);
	const [activeCategory, setActiveCategory] = React.useState("");
	const query = useCategoryExpenses(month);
	const locale = i18n.resolvedLanguage === "vi" ? "vi-VN" : "en-US";
	const monthOptions = React.useMemo(() => {
		const [year, monthNumber] = currentMonth().split("-").map(Number);
		const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
		return Array.from({ length: 12 }, (_, offset) => {
			const date = new Date(year, monthNumber - 1 - offset, 1);
			return { value: currentMonth(date), label: formatter.format(date) };
		});
	}, [locale]);
	const chartData = query.data?.items.map((item, index) => ({
		category: item.category,
		amount: Number(item.amount),
		fill: `var(--chart-${index % 5 + 1})`,
	})) ?? [];
	const activeIndex = Math.max(0, chartData.findIndex((item) => item.category === activeCategory));
	const activeItem = chartData[activeIndex];
	const currency = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: query.data?.currency ?? "EUR",
	});
	const chartConfig = {
		amount: { label: t("dashboard.categoryBreakdown.amount") },
	} satisfies ChartConfig;

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-col gap-1">
					<CardTitle>{t("dashboard.categoryBreakdown.title")}</CardTitle>
					<CardDescription>{t("dashboard.categoryBreakdown.description")}</CardDescription>
				</div>
				<Select value={month} onValueChange={setMonth}>
					<SelectTrigger className="w-48" aria-label={t("dashboard.categoryBreakdown.month")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end">
						<SelectGroup>
							{monthOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent>
				{query.isPending ? (
					<Skeleton className="h-80 w-full" />
				) : query.isError ? (
					<div className="flex h-80 flex-col items-center justify-center gap-3 text-center">
						<p className="text-muted-foreground">{t("dashboard.categoryBreakdown.error")}</p>
						<Button variant="outline" onClick={() => void query.refetch()}>
							{t("dashboard.categoryBreakdown.retry")}
						</Button>
					</div>
				) : chartData.length === 0 ? (
					<p className="flex h-80 items-center justify-center text-muted-foreground">
						{t("dashboard.categoryBreakdown.empty")}
					</p>
				) : (
					<div className="grid items-center gap-6 lg:grid-cols-2">
						<ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-75">
							<PieChart accessibilityLayer>
								<ChartTooltip
									cursor={false}
									content={<ChartTooltipContent hideLabel formatter={(value) => currency.format(Number(value))} />}
								/>
								<Pie
									data={chartData}
									dataKey="amount"
									nameKey="category"
									innerRadius={60}
									strokeWidth={5}
									onClick={(item) => setActiveCategory(item.category)}
									activeShape={({ outerRadius = 0, ...props }: PieSectorDataItem) => (
										<g>
											<Sector {...props} outerRadius={outerRadius + 10} />
											<Sector {...props} outerRadius={outerRadius + 25} innerRadius={outerRadius + 12} />
										</g>
									)}
								>
									<Label
										content={({ viewBox }) => {
											if (!activeItem || !viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
											return (
												<text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
													<tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
														{currency.format(activeItem.amount)}
													</tspan>
													<tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground">
														{activeItem.category}
													</tspan>
												</text>
											);
										}}
									/>
								</Pie>
							</PieChart>
						</ChartContainer>
						<div className="flex flex-col gap-2">
							{chartData.map((item, index) => (
								<Button
									key={item.category}
									type="button"
									variant={index === activeIndex ? "secondary" : "ghost"}
									className="h-auto justify-between p-3"
									onClick={() => setActiveCategory(item.category)}
								>
									<span className="flex items-center gap-3">
										<span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
										<span className="font-medium">{item.category}</span>
									</span>
									<span className="font-semibold tabular-nums">{currency.format(item.amount)}</span>
								</Button>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
