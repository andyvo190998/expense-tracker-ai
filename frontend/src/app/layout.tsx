import type { Metadata } from "next";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { inter } from "@/lib/fonts";
import { I18nProvider } from "@/i18n/provider";
import { CopilotProvider } from "./copilot-provider";

export const metadata: Metadata = {
	title: "Expense Tracker AI",
	description: "A dashboard built with Next.js and shadcn/ui",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="vi" className={`${inter.variable} antialiased`}>
			<body className={inter.className}>
				<ThemeProvider defaultTheme="system" storageKey="nextjs-ui-theme">
					<I18nProvider>
						<CopilotProvider>
							<SidebarConfigProvider>{children}</SidebarConfigProvider>
						</CopilotProvider>
					</I18nProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
