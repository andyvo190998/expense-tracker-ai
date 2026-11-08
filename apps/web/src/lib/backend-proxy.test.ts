// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxyToBackend } from "./backend-proxy";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it("reads the binding at request time and preserves its base path and auth headers", async () => {
	vi.stubEnv("EXPENSE_API_URL", "https://internal.example/expense/");
	vi.stubEnv("BACKEND_AGENT_URL", "http://legacy.example/agents/expense");
	const fetchMock = vi.fn().mockResolvedValue(new Response("{}", {
		headers: { "set-cookie": "access_token=new; Path=/; HttpOnly" },
	}));
	vi.stubGlobal("fetch", fetchMock);
	const response = await proxyToBackend(new NextRequest("https://app.example/api/auth/me?x=1", {
		headers: { cookie: "access_token=old", "x-csrf-token": "csrf" },
	}), "/auth/me");
	const [url, init] = fetchMock.mock.calls[0];
	expect(String(url)).toBe("https://internal.example/expense/auth/me?x=1");
	expect(init.headers.get("cookie")).toBe("access_token=old");
	expect(init.headers.get("x-csrf-token")).toBe("csrf");
	expect(response.headers.get("set-cookie")).toBe("access_token=new; Path=/; HttpOnly");
});

it("keeps the existing agent URL setting working outside Vercel", async () => {
	vi.stubEnv("EXPENSE_API_URL", undefined);
	vi.stubEnv("BACKEND_AGENT_URL", "http://legacy.example/agents/expense");
	const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
	vi.stubGlobal("fetch", fetchMock);
	await proxyToBackend(new NextRequest("https://app.example/api/expenses"), "/expenses");
	expect(String(fetchMock.mock.calls[0][0])).toBe("http://legacy.example/expenses");
});
