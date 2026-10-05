"use client";

import * as React from "react";
import {
	LayoutPanelLeft,
	LayoutDashboard,
	Mail,
	CheckSquare,
	MessageCircle,
	Calendar,
	Users,
	BriefcaseBusiness,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/logo";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/contexts/auth-context";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { t } = useTranslation();
	const { user } = useAuth();
	const navGroups = [
		...(user?.role === "merchant" ? [{
			label: t("nav.dashboards"),
			items: [
				{ title: t("nav.dashboard1"), url: "/dashboard", icon: LayoutDashboard },
				{ title: t("nav.dashboard2"), url: "/chi-tieu", icon: LayoutPanelLeft },
			],
		}] : []),
		...(user?.role === "admin" ? [{
			label: "Administration",
			items: [{ title: "Users", url: "/admin/users", icon: Users }],
		}] : []),
		{
			label: t("nav.apps"),
			items: [
				{ title: t("nav.mail"), url: "/mail", icon: Mail },
				{ title: t("nav.tasks"), url: "/tasks", icon: CheckSquare },
				{ title: t("nav.chat"), url: "/chat", icon: MessageCircle },
				{ title: t("nav.calendar"), url: "/calendar", icon: Calendar },
				{ title: t("nav.users"), url: "/users", icon: Users },
				{ title: t("nav.chiaLuot"), url: "/chia-luot", icon: BriefcaseBusiness },
			],
		},
	];

	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link href="/dashboard">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<Logo size={24} className="text-current" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">Expense Tracker AI</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				{navGroups.map((group) => (
					<NavMain key={group.label} label={group.label} items={group.items} />
				))}
			</SidebarContent>
			<SidebarFooter>
				{user ? <NavUser user={{ ...user, avatar: "" }} /> : null}
			</SidebarFooter>
		</Sidebar>
	);
}
