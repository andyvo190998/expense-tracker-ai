import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RequireRole } from "./require-role";

const state = vi.hoisted(() => ({
	auth: { status: "loading", user: null } as { status: string; user: null | { role: string } },
	replace: vi.fn(),
}));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));

afterEach(() => { cleanup(); state.replace.mockReset(); });

it("does not render protected children while loading", () => {
	state.auth = { status: "loading", user: null };
	render(<RequireRole allow={["merchant"]}><span>secret</span></RequireRole>);
	expect(screen.queryByText("secret")).not.toBeInTheDocument();
});

it("redirects visitors to the real sign-in route", () => {
	state.auth = { status: "unauthenticated", user: null };
	render(<RequireRole allow={["merchant"]}><span>secret</span></RequireRole>);
	expect(state.replace).toHaveBeenCalledWith("/sign-in");
});

it("renders only the allowed role", () => {
	state.auth = { status: "authenticated", user: { role: "merchant" } };
	const { rerender } = render(
		<RequireRole allow={["merchant"]}><span>secret</span></RequireRole>,
	);
	expect(screen.getByText("secret")).toBeInTheDocument();
	state.auth = { status: "authenticated", user: { role: "admin" } };
	rerender(<RequireRole allow={["merchant"]}><span>secret</span></RequireRole>);
	expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
});
