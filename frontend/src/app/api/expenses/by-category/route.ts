import type { NextRequest } from "next/server";

const backendOrigin = new URL(
	process.env.BACKEND_AGENT_URL ?? "http://localhost:8000/agents/expense",
).origin;

export async function GET(request: NextRequest) {
	const startDate = request.nextUrl.searchParams.get("start_date");
	const endDate = request.nextUrl.searchParams.get("end_date");
	if (!startDate || !endDate) {
		return Response.json(
			{ detail: "start_date and end_date are required" },
			{ status: 400 },
		);
	}

	const url = new URL("/expenses/by-category", backendOrigin);
	url.search = new URLSearchParams({
		start_date: startDate,
		end_date: endDate,
	}).toString();
	const response = await fetch(url, { cache: "no-store" });

	return new Response(response.body, {
		status: response.status,
		headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
	});
}
