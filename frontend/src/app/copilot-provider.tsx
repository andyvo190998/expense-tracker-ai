"use client";

import { CopilotKitProvider, CopilotPopup } from "@copilotkit/react-core/v2";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function CopilotProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());
	const { t } = useTranslation();

	return (
		<QueryClientProvider client={queryClient}>
			<CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="expense_agent">
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
