import type { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/backend-proxy";

const actions = new Set(["csrf", "register", "login", "refresh", "logout", "me"]);

async function handle(request: NextRequest, context: { params: Promise<{ action: string }> }) {
	const { action } = await context.params;
	if (!actions.has(action)) return Response.json({ detail: "Not found" }, { status: 404 });
	return proxyToBackend(request, `/auth/${action}`);
}

export const GET = handle;
export const POST = handle;
