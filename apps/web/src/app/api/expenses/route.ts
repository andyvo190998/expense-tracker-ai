import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function GET(request: NextRequest) {
	const startDate = request.nextUrl.searchParams.get("start_date");
	const endDate = request.nextUrl.searchParams.get("end_date");
	if (!startDate || !endDate) {
		return Response.json({ detail: "start_date and end_date are required" }, { status: 400 });
	}

	return proxyToBackend(request, "/expenses");
}
