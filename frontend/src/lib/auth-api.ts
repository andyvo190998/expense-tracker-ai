import type { AuthUser, LoginInput, RegisterInput } from "./auth-types";
import { AuthError } from "./auth-types";

function cookie(name: string): string | undefined {
	if (typeof document === "undefined") return undefined;
	return document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

function withAuth(init: RequestInit = {}): RequestInit {
	const headers = new Headers(init.headers);
	const method = (init.method ?? "GET").toUpperCase();
	if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
		const csrf = cookie("csrf_token");
		if (csrf) headers.set("X-CSRF-Token", decodeURIComponent(csrf));
	}
	return { ...init, credentials: "include", headers };
}

export async function authFetch(
	input: RequestInfo | URL,
	init: RequestInit = {},
	retry = true,
): Promise<Response> {
	const response = await fetch(input, withAuth(init));
	if (response.status !== 401 || !retry || String(input).includes("/api/auth/")) {
		return response;
	}
	const refreshed = await fetch("/api/auth/refresh", withAuth({ method: "POST" }));
	if (!refreshed.ok) return response;
	return fetch(input, withAuth(init));
}

async function json<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = (await response.json().catch(() => ({}))) as {
			code?: string;
			message?: string;
		};
		throw new AuthError(
			response.status,
			error.code ?? "REQUEST_FAILED",
			error.message ?? "Request failed.",
		);
	}
	return response.json() as Promise<T>;
}

async function ensureCsrf(): Promise<void> {
	await fetch("/api/auth/csrf", { credentials: "include" });
}

export const authApi = {
	async me(): Promise<AuthUser> {
		return json<AuthUser>(await authFetch("/api/auth/me", {}, false));
	},
	async login(input: LoginInput): Promise<AuthUser> {
		await ensureCsrf();
		return json<AuthUser>(
			await authFetch("/api/auth/login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			}, false),
		);
	},
	async register(input: RegisterInput): Promise<AuthUser> {
		await ensureCsrf();
		return json<AuthUser>(
			await authFetch("/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			}, false),
		);
	},
	async logout(): Promise<void> {
		await ensureCsrf();
		await authFetch("/api/auth/logout", { method: "POST" }, false);
	},
};
