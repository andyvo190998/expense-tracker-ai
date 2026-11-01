import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth-context";

const { me, updateProfile } = vi.hoisted(() => ({ me: vi.fn(), updateProfile: vi.fn() }));
vi.mock("@/lib/auth-api", () => ({
	authApi: { me, login: vi.fn(), register: vi.fn(), logout: vi.fn(), updateProfile },
}));

function Probe() {
	const auth = useAuth();
	return <>
		<span>{auth.status}:{auth.user?.role ?? "none"}:{auth.user?.name ?? "none"}</span>
		<button type="button" onClick={() => void auth.updateProfile({
			name: "Updated User",
			monthly_expense_target: "1250.50",
		})}>Update</button>
	</>;
}

beforeEach(() => {
	me.mockReset();
	updateProfile.mockReset();
});
afterEach(cleanup);

it("bootstraps the authenticated user", async () => {
	me.mockResolvedValue({
		id: "1", email: "user@example.com", name: "User", role: "merchant", is_active: true,
		monthly_expense_target: "500.00",
	});
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(screen.getByText("loading:none:none")).toBeInTheDocument();
	expect(await screen.findByText("authenticated:merchant:User")).toBeInTheDocument();
});

it("settles unauthenticated when bootstrap has no user", async () => {
	me.mockResolvedValue(null);
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(await screen.findByText("unauthenticated:none:none")).toBeInTheDocument();
});

it("becomes unauthenticated after an unauthorized API response", async () => {
	me.mockResolvedValue({
		id: "1", email: "user@example.com", name: "User", role: "merchant", is_active: true,
		monthly_expense_target: "500.00",
	});
	render(<AuthProvider><Probe /></AuthProvider>);
	expect(await screen.findByText("authenticated:merchant:User")).toBeInTheDocument();
	window.dispatchEvent(new Event("auth:unauthorized"));
	expect(await screen.findByText("unauthenticated:none:none")).toBeInTheDocument();
});

it("replaces the current user after a profile update", async () => {
	me.mockResolvedValue({
		id: "1", email: "user@example.com", name: "User", role: "merchant", is_active: true,
		monthly_expense_target: "500.00",
	});
	updateProfile.mockResolvedValue({
		id: "1", email: "user@example.com", name: "Updated User", role: "merchant", is_active: true,
		monthly_expense_target: "1250.50",
	});
	render(<AuthProvider><Probe /></AuthProvider>);
	await screen.findByText("authenticated:merchant:User");

	fireEvent.click(screen.getByRole("button", { name: "Update" }));

	expect(await screen.findByText("authenticated:merchant:Updated User")).toBeInTheDocument();
});
