"use client";

import { TrendingUp, TrendingDown, DollarSign, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCategoryExpenses } from "@/hooks/use-category-expenses";
import { MONTHLY_TARGET } from "@/lib/expense-constants";
import { currentMonth, percentageOf } from "@/lib/expense-period";

export function MetricsOverview() {
	const { i18n, t } = useTranslation();
	const currentExpenses = useCategoryExpenses(currentMonth());
	const locale = i18n.resolvedLanguage === "vi" ? "vi-VN" : "en-US";
	const currency = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: currentExpenses.data?.currency ?? "EUR",
	});
	const currentAmount = currentExpenses.data ? Number(currentExpenses.data.total) : null;
	const currentTotal = currentExpenses.data ? currency.format(currentAmount ?? 0) : "—";
	const currentPercentage =
		currentAmount === null
			? "—"
			: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
					percentageOf(currentAmount, MONTHLY_TARGET),
				)}%`;
	const metrics = [
		{
			title: t("dashboard.monthlyTotal"),
			value: currency.format(MONTHLY_TARGET),
			change: "+12%",
			trend: "up",
			icon: DollarSign,
		},
		{
			title: t("dashboard.currentTotal"),
			value: currentTotal,
			change: currentPercentage,
			trend: "up",
			icon: Users,
		},
	];

	return (
		<div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs grid gap-4 sm:grid-cols-2 @5xl:grid-cols-4">
			{metrics.map((metric) => {
				const TrendIcon = metric.trend === "up" ? TrendingUp : TrendingDown;

				return (
					<Card key={metric.title} className=" cursor-pointer">
						<CardHeader>
							<CardDescription>{metric.title}</CardDescription>
							<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
								{metric.value}
							</CardTitle>
							<CardAction>
								<Badge variant="outline">
									<TrendIcon className="h-4 w-4" />
									{metric.change}
								</Badge>
							</CardAction>
						</CardHeader>
					</Card>
				);
			})}
		</div>
	);
}
