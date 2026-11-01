import type { NextRequest } from "next/server";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
	const { path } = await context.params;
	const url = new URL(`/v1/${path.join("/")}`, process.env.WORKFORCE_API_URL ?? "http://localhost:8001");
	url.search = request.nextUrl.search;
	const headers = new Headers();
	for (const name of ["cookie", "content-type", "x-csrf-token"]) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const method = request.method.toUpperCase();
	const response = await fetch(url, { method, headers, body: ["GET", "HEAD"].includes(method) ? undefined : await request.arrayBuffer(), cache: "no-store" });
	return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
