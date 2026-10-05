"use client";

import { useEffect, useState } from "react";
import { RequireRole } from "@/components/auth/require-role";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { authFetch } from "@/lib/auth-api";
import type { AuthUser } from "@/lib/auth-types";

type AdminUser = AuthUser & { created_at: string; updated_at: string };

export default function AdminUsersPage() {
	const { user: currentUser } = useAuth();
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [error, setError] = useState<string | null>(null);
	async function load() {
		const response = await authFetch("/api/admin/users");
		if (!response.ok) throw new Error("Could not load users");
		setUsers(((await response.json()) as { items: AdminUser[] }).items);
	}
	useEffect(() => {
		let active = true;
		void authFetch("/api/admin/users")
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load users");
				const items = ((await response.json()) as { items: AdminUser[] }).items;
				if (active) setUsers(items);
			})
			.catch((value) => {
				if (active) setError(String(value));
			});
		return () => {
			active = false;
		};
	}, []);
	async function setActive(user: AdminUser, is_active: boolean) {
		const response = await authFetch(`/api/admin/users/${user.id}/status`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ is_active }),
		});
		if (!response.ok) {
			setError("Could not update user");
			return;
		}
		await load();
	}
	return (
		<RequireRole allow={["admin"]}>
			<div className="px-4 lg:px-6">
				<Card>
					<CardHeader>
						<CardTitle>User administration</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
						{users.map((user) => (
							<div
								key={user.id}
								className="flex items-center justify-between rounded border p-3"
							>
								<div>
									<p className="font-medium">{user.name}</p>
									<p className="text-sm text-muted-foreground">
										{user.email} · {user.role}
									</p>
								</div>
								<Button
									variant="outline"
									disabled={user.id === currentUser?.id && user.is_active}
									onClick={() => void setActive(user, !user.is_active)}
								>
									{user.is_active ? "Deactivate" : "Activate"}
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			</div>
		</RequireRole>
	);
}
