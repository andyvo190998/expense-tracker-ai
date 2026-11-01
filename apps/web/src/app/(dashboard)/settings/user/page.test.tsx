import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import UserSettingsPage from "./page";

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

it("loads and saves the user's name and monthly expense target", async () => {
	updateProfile.mockResolvedValue({
		id: "1",
		email: "user@example.com",
		name: "Updated User",
		role: "merchant",
		is_active: true,
		monthly_expense_target: "1250.50",
	});
	render(<UserSettingsPage />);

	expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
	expect(screen.getByLabelText("Email")).toBeDisabled();
	fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated User" } });
	fireEvent.change(screen.getByLabelText("Monthly expense target"), {
		target: { value: "1250.50" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

	await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
		name: "Updated User",
		monthly_expense_target: "1250.50",
	}));
	expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
});
