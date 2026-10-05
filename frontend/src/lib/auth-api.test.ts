import { afterEach, describe, expect, it, vi } from "vitest";

import { authFetch } from "./auth-api";

describe("authFetch", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		document.cookie = "csrf_token=; Max-Age=0; path=/";
	});

	it("adds credentials and CSRF to mutations", async () => {
		document.cookie = "csrf_token=csrf-value; path=/";
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await authFetch("/api/expenses/1", { method: "PATCH", body: "{}" });

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/expenses/1");
		expect(init.credentials).toBe("include");
		expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf-value");
	});

	it("refreshes and retries once after an access 401", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		expect((await authFetch("/api/expenses")).status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
	});

	it("does not loop when refresh fails", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		expect((await authFetch("/api/expenses")).status).toBe(401);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
