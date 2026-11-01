import { describe, expect, it, vi } from "vitest";

import { createExpenseClient, createWorkforceClient } from "./index";

describe("typed API clients", () => {
	it("uses the injected transport and configured service base URL", async () => {
		const transport = vi.fn().mockImplementation(async () =>
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const expense = createExpenseClient({ baseUrl: "/api", fetch: transport });
		const workforce = createWorkforceClient({ baseUrl: "/api/workforce", fetch: transport });

		await expense.GET("/expenses");
		await workforce.GET("/v1/employees");

		expect(transport.mock.calls[0][0].url).toBe("http://localhost/api/expenses");
		expect(transport.mock.calls[1][0].url).toBe("http://localhost/api/workforce/v1/employees");
	});
});
