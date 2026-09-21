"use client";

import { CopilotKitProvider, CopilotPopup } from "@copilotkit/react-core/v2";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="expense_agent">
        {children}
        <CopilotPopup
          agentId="expense_agent"
          labels={{
            chatInputPlaceholder: "Try: spent 30 euros at Aldi today",
          }}
        />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}
