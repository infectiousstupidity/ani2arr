/** Immediate options-page mount with shared styles loaded first. */

import "./style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { OptionsPage } from "@/options-page";
import { createExtensionQueryClient } from "@/queries/query-client";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";

const queryClient = createExtensionQueryClient();

const rootElement = document.querySelector("#options-root");

if (rootElement) {
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
