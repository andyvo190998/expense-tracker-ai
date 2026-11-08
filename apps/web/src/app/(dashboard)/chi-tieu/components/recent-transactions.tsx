"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpenses } from "@/hooks/use-expenses";
import { currentMonth, pageItems } from "@/lib/expense-period";

export function RecentTransactions() {
	const { i18n, t } = useTranslation();
	const [page, setPage] = React.useState(1);
	const query = useExpenses(currentMonth());
	const pageCount = Math.max(1, Math.ceil((query.data?.length ?? 0) / 5));
	const money = new Intl.NumberFormat(i18n.resolvedLanguage === "vi" ? "vi-VN" : "en-US", {
		style: "currency",
		currency: query.data?.[0]?.currency ?? "EUR",
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("dashboard.recentTransactions.title")}</CardTitle>
				<CardDescription>{t("dashboard.recentTransactions.description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{query.isPending ? (
					<Skeleton className="h-48 w-full" />
				) : query.isError ? (
					<p className="py-12 text-center text-sm text-destructive">
						{t("dashboard.recentTransactions.error")}
					</p>
				) : query.data.length === 0 ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						{t("dashboard.recentTransactions.empty")}
					</p>
				) : (
					pageItems(query.data, page).map((transaction) => (
						<div
							key={transaction.id}
							className="flex items-center justify-between gap-4 rounded-lg border p-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">
									{transaction.merchant ?? t("dashboard.recentTransactions.expense")}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{transaction.description ?? transaction.spent_at}
								</p>
							</div>
							<div className="shrink-0 text-right">
								<p className="text-sm font-medium tabular-nums">
									{money.format(Number(transaction.amount))}
								</p>
								<p className="text-xs text-muted-foreground">
									{transaction.spent_at}
								</p>
							</div>
						</div>
					))
				)}
				{query.data && query.data.length > 5 ? (
					<div className="flex items-center justify-between pt-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page === 1}
							onClick={() => setPage((current) => current - 1)}
						>
							{t("dashboard.recentTransactions.previous")}
						</Button>
						<p className="text-sm text-muted-foreground">
							{t("dashboard.recentTransactions.page", { page, total: pageCount })}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page === pageCount}
							onClick={() => setPage((current) => current + 1)}
						>
							{t("dashboard.recentTransactions.next")}
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
