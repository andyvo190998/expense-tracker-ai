import type { NextRequest } from "next/server";

const backendOrigin = new URL(
	process.env.BACKEND_AGENT_URL ?? "http://localhost:8000/agents/expense",
).origin;

export async function proxyToBackend(
	request: NextRequest,
	backendPath: string,
): Promise<Response> {
	const url = new URL(backendPath, backendOrigin);
	url.search = request.nextUrl.search;
	const headers = new Headers();
	for (const name of ["cookie", "content-type", "x-csrf-token"]) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const method = request.method.toUpperCase();
	const response = await fetch(url, {
		method,
		headers,
		body: ["GET", "HEAD"].includes(method) ? undefined : await request.arrayBuffer(),
		cache: "no-store",
	});
	const outgoing = new Headers();
	const contentType = response.headers.get("content-type");
	if (contentType) outgoing.set("content-type", contentType);
	for (const value of response.headers.getSetCookie()) outgoing.append("set-cookie", value);
	return new Response(response.body, { status: response.status, headers: outgoing });
}
