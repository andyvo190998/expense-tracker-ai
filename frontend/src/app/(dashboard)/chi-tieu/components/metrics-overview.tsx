"use client";

import { useTranslation } from "react-i18next";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useCategoryExpenses } from "@/hooks/use-category-expenses";
import { MONTHLY_TARGET } from "@/lib/expense-constants";
import { budgetProgress, currentMonth, percentageOf } from "@/lib/expense-period";

export function MetricsOverview() {
	const { i18n, t } = useTranslation();
	const currentExpenses = useCategoryExpenses(currentMonth());
	const locale = i18n.resolvedLanguage === "vi" ? "vi-VN" : "en-US";
	const currency = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: currentExpenses.data?.currency ?? "EUR",
	});
	const currentAmount = currentExpenses.data ? Number(currentExpenses.data.total) : null;
	const currentTotal = currentAmount === null ? "—" : currency.format(currentAmount);
	const currentPercentage =
		currentAmount === null
			? "—"
			: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
					percentageOf(currentAmount, MONTHLY_TARGET),
				)}%`;
	const progress = currentAmount === null ? null : budgetProgress(currentAmount, MONTHLY_TARGET);
	const budgetStatus =
		progress === null
			? t("dashboard.budget.loading")
			: progress.exceeded > 0
				? t("dashboard.budget.exceeded", { amount: currency.format(progress.exceeded) })
				: t("dashboard.budget.remaining", { amount: currency.format(progress.remaining) });

	return (
		<div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs grid gap-4 sm:grid-cols-2 @5xl:grid-cols-4">
			<Card className="sm:col-span-2 @5xl:col-span-4">
				<CardHeader>
					<CardDescription>{t("dashboard.budget.title")}</CardDescription>
					<CardTitle className="text-lg tabular-nums">{budgetStatus}</CardTitle>
					<CardAction className="text-muted-foreground text-sm tabular-nums">
						{currentPercentage}
					</CardAction>
				</CardHeader>
				<CardContent>
					<Progress
						value={progress?.percentage ?? 0}
						aria-label={t("dashboard.budget.progressLabel")}
						aria-valuetext={budgetStatus}
						className="h-3"
					/>
					<div className="text-muted-foreground mt-2 grid grid-cols-3 text-xs tabular-nums">
						<span className="text-left">{currency.format(0)}</span>
						<span className="text-center font-medium text-foreground">{currentTotal}</span>
						<span className="text-right">{currency.format(MONTHLY_TARGET)}</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
