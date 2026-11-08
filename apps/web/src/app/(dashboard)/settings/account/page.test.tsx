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
			notification_emails: ["existing@example.com"],
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
			notification_emails: ["existing@example.com"],
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
			notification_emails: ["existing@example.com"],
		}),
	);
	expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
});


it("loads and saves notification recipients from account settings", async () => {
	updateProfile.mockResolvedValue({
		name: "Current User", monthly_expense_target: "500.00",
		notification_emails: ["owner@example.com", "second@example.com"],
	});
	render(<AccountSettingsPage />);
	const field = screen.getByLabelText("Notification emails");
	expect(field).toHaveValue("existing@example.com");
	fireEvent.change(field, { target: { value: " owner@example.com \nsecond@example.com\n" } });
	fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
	await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
		name: "Current User", monthly_expense_target: "500.00",
		notification_emails: ["owner@example.com", "second@example.com"],
	}));
	expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
	expect(field).toHaveValue("owner@example.com\nsecond@example.com");
});

it("clears recipients to disable future emails", async () => {
	updateProfile.mockResolvedValue({
		name: "Current User", monthly_expense_target: "500.00", notification_emails: [],
	});
	render(<AccountSettingsPage />);
	fireEvent.change(screen.getByLabelText("Notification emails"), { target: { value: "" } });
	fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
	await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
		name: "Current User", monthly_expense_target: "500.00", notification_emails: [],
	}));
});

it.each(["bad-address", Array(6).fill("a@example.com").join("\n")])(
	"rejects invalid recipient input %s",
	async (value) => {
		render(<AccountSettingsPage />);
		fireEvent.change(screen.getByLabelText("Notification emails"), { target: { value } });
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(updateProfile).not.toHaveBeenCalled();
	},
);

it("keeps edited recipients when the API update fails", async () => {
	updateProfile.mockRejectedValue(new Error("Request failed"));
	render(<AccountSettingsPage />);
	fireEvent.change(screen.getByLabelText("Notification emails"), {
		target: { value: "keep@example.com" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
	expect(await screen.findByText("Could not update profile.")).toBeInTheDocument();
	expect(screen.getByLabelText("Notification emails")).toHaveValue("keep@example.com");
});
