"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";
import type { UserRole } from "@/lib/auth-types";

export function RequireRole({
	allow,
	children,
}: {
	allow: UserRole[];
	children: React.ReactNode;
}) {
	const auth = useAuth();
	const router = useRouter();
	useEffect(() => {
		if (auth.status === "unauthenticated") router.replace("/sign-in");
	}, [auth.status, router]);
	if (auth.status !== "authenticated") return null;
	if (!auth.user || !allow.includes(auth.user.role)) {
		return <p className="p-6 text-sm text-destructive">Forbidden: this account cannot access this page.</p>;
	}
	return children;
}
