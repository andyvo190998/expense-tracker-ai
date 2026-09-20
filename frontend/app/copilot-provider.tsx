"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

export function CopilotProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: { queries: { staleTime: 60_000 } },
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="expense_agent">
				{children}
			</CopilotKitProvider>
		</QueryClientProvider>
	);
}
