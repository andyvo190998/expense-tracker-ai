"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";

export default function Home() {
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col p-4 sm:p-8">
			<header className="mb-4">
				<h1 className="text-2xl font-semibold">Expense Assistant</h1>
				<p className="text-sm text-zinc-600">
					Record an expense or ask about your spending.
				</p>
			</header>
			<section className="pt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
				<CopilotChat
					agentId="expense_agent"
					labels={{
						chatInputPlaceholder: "Try: spent 30 euros at Aldi today",
					}}
				/>
			</section>
		</main>
	);
}
