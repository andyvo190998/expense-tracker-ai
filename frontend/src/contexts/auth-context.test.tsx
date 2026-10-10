import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth-context";

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/auth-api", () => ({
	authApi: { me, login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}));

function Probe() {
	const auth = useAuth();
	return <span>{auth.status}:{auth.user?.role ?? "none"}</span>;
}

beforeEach(() => me.mockReset());
afterEach(cleanup);

it("bootstraps the authenticated user", async () => {
	me.mockResolvedValue({
		id: "1", email: "user@example.com", name: "User", role: "merchant", is_active: true,
	});
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(screen.getByText("loading:none")).toBeInTheDocument();
	expect(await screen.findByText("authenticated:merchant")).toBeInTheDocument();
});

it("settles unauthenticated when bootstrap has no user", async () => {
	me.mockResolvedValue(null);
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(await screen.findByText("unauthenticated:none")).toBeInTheDocument();
});

it("becomes unauthenticated after an unauthorized API response", async () => {
	me.mockResolvedValue({
		id: "1", email: "user@example.com", name: "User", role: "merchant", is_active: true,
	});
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(await screen.findByText("authenticated:merchant")).toBeInTheDocument();
	window.dispatchEvent(new Event("auth:unauthorized"));
	expect(await screen.findByText("unauthenticated:none")).toBeInTheDocument();
});
