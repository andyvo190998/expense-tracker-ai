import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import AccountSettingsPage from "./page";

const updateProfile = vi.fn();
vi.mock("@/contexts/auth-context", () => ({
	useAuth: () => ({
		user: {
			id: "1",
			email: "user@example.com",
			name: "Current User",
			role: "merchant",
			is_active: true,
			monthly_expense_target: "500.00",
		},
		updateProfile,
	}),
}));

afterEach(() => {
	cleanup();
	updateProfile.mockReset();
});

it("updates the monthly expense target from account settings", async () => {
	updateProfile.mockResolvedValue({
		id: "1",
		email: "user@example.com",
		name: "Current User",
		role: "merchant",
		is_active: true,
		monthly_expense_target: "750.00",
	});
	render(<AccountSettingsPage />);

	const target = screen.getByLabelText("Monthly expense target");
	expect(target).toHaveValue("500.00");
	fireEvent.change(target, { target: { value: "750.00" } });
	fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

	await waitFor(() =>
		expect(updateProfile).toHaveBeenCalledWith({
			name: "Current User",
			monthly_expense_target: "750.00",
		}),
	);
	expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
});
