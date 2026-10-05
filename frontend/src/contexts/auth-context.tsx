"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authApi } from "@/lib/auth-api";
import type { AuthUser, LoginInput, RegisterInput } from "@/lib/auth-types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
	status: AuthStatus;
	user: AuthUser | null;
	login(input: LoginInput): Promise<AuthUser>;
	register(input: RegisterInput): Promise<AuthUser>;
	logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>("loading");
	const [user, setUser] = useState<AuthUser | null>(null);

	useEffect(() => {
		let active = true;
		void (async () => {
			try {
				const value = await authApi.me();
				if (!value) throw new Error("Missing authenticated user");
				if (!active) return;
				setUser(value);
				setStatus("authenticated");
			} catch {
				if (!active) return;
				setUser(null);
				setStatus("unauthenticated");
			}
		})();
		return () => { active = false; };
	}, []);

	const login = useCallback(async (input: LoginInput) => {
		const value = await authApi.login(input);
		setUser(value);
		setStatus("authenticated");
		return value;
	}, []);
	const register = useCallback(async (input: RegisterInput) => {
		const value = await authApi.register(input);
		setUser(value);
		setStatus("authenticated");
		return value;
	}, []);
	const logout = useCallback(async () => {
		await authApi.logout();
		setUser(null);
		setStatus("unauthenticated");
	}, []);

	const value = useMemo(
		() => ({ status, user, login, register, logout }),
		[status, user, login, register, logout],
	);
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext);
	if (!value) throw new Error("useAuth must be used within AuthProvider");
	return value;
}
