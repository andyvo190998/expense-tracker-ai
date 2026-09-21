"use client";

import { TrendingUp, TrendingDown, DollarSign, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function MetricsOverview() {
	const { t } = useTranslation();
	const metrics = [
		{ title: t("dashboard.monthlyTotal"), value: "€400,00", change: "+12%", trend: "up", icon: DollarSign },
		{ title: t("dashboard.currentTotal"), value: "€180,00", change: "+5.2%", trend: "up", icon: Users },
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
