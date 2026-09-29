"use client";

import { CopilotKitProvider, CopilotPopup, useAgent } from "@copilotkit/react-core/v2";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { createExpenseToolResultTracker } from "./expense-cache-invalidation";

function ExpenseCacheInvalidator() {
	const { agent, isReady } = useAgent({ agentId: "expense_agent" });
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!isReady) return;
		const tracker = createExpenseToolResultTracker(() => {
			void queryClient.invalidateQueries({ queryKey: ["expenses"] });
		});
		const subscription = agent.subscribe({
			onToolCallStartEvent: ({ event }) => {
				tracker.onToolCallStart(event.toolCallId, event.toolCallName);
			},
			onToolCallResultEvent: ({ event }) => {
				tracker.onToolCallResult(event.toolCallId, event.content);
			},
		});
		return subscription.unsubscribe;
	}, [agent, isReady, queryClient]);

	return null;
}

export function CopilotProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());
	const { t } = useTranslation();

	return (
		<QueryClientProvider client={queryClient}>
			<CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="expense_agent">
				<ExpenseCacheInvalidator />
				{children}
				<CopilotPopup
					agentId="expense_agent"
					header={t("chat.header")}
					defaultOpen={false}
					labels={{
						chatInputPlaceholder: t("chat.placeholder"),
					}}
				/>
			</CopilotKitProvider>
		</QueryClientProvider>
	);
}
