import { HttpAgent } from "@ag-ui/client";
import {
	CopilotRuntime,
	createCopilotRuntimeHandler,
	InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";

function createHandler(request: Request) {
	const headers: Record<string, string> = {};
	const cookie = request.headers.get("cookie");
	const csrf = request.headers.get("x-csrf-token");
	if (cookie) headers.cookie = cookie;
	if (csrf) headers["x-csrf-token"] = csrf;
	const runtime = new CopilotRuntime({
		agents: {
			expense_agent: new HttpAgent({
				url: process.env.BACKEND_AGENT_URL ?? "http://localhost:8000/agents/expense",
				headers,
			}),
		},
		runner: new InMemoryAgentRunner(),
	});
	return createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });
}

async function handle(request: Request): Promise<Response> {
	return createHandler(request)(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
