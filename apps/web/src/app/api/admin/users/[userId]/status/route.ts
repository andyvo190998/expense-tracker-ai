import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;
	return proxyToBackend(request, `/admin/users/${encodeURIComponent(userId)}/status`);
}
