import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MetricsOverview } from "./metrics-overview";

vi.mock("@/contexts/auth-context", () => ({
	useAuth: () => ({
		user: {
			id: "1",
			email: "user@example.com",
			name: "User",
			role: "merchant",
			is_active: true,
			monthly_expense_target: "1000.00",
		},
	}),
}));
vi.mock("@/hooks/use-category-expenses", () => ({
	useCategoryExpenses: () => ({ data: { total: "250.00", currency: "EUR", items: [] } }),
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { resolvedLanguage: "en" },
		t: (key: string, values?: { amount?: string }) => values?.amount ?? key,
	}),
}));

afterEach(cleanup);

it("calculates monthly progress from the authenticated user's target", () => {
	render(<MetricsOverview />);

	expect(screen.getByText("25%")).toBeInTheDocument();
	expect(screen.getByText("€1,000.00")).toBeInTheDocument();
});
