/** React mount for the options page. */
// src/entrypoints/options/options-app.tsx

import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createExtensionQueryClient } from "@/queries/query-client";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";
import { OptionsPage } from "@/options-page";

const queryClient = createExtensionQueryClient();

export function mountOptionsApp(rootElement: Element): void {
	createRoot(rootElement).render(
		<React.StrictMode>
			<ExtensionErrorBoundary scope="options-root">
				<QueryClientProvider client={queryClient}>
					<OptionsPage />
				</QueryClientProvider>
			</ExtensionErrorBoundary>
		</React.StrictMode>,
	);
}
