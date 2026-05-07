/** Thin boot entrypoint for the options page. */
// src/entrypoints/options/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ExtensionErrorBoundary } from '@/shared/ui/feedback/extension-error-boundary';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';
import ToastProvider from '@/shared/ui/feedback/toast-provider';
import { OptionsPage } from '@/options-page';

const queryClient = new QueryClient();
// Find the root element and render the app.
const rootElement = document.querySelector('#options-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ExtensionErrorBoundary scope="options-root">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ToastProvider>
              <ConfirmProvider>
                <OptionsPage />
              </ConfirmProvider>
            </ToastProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ExtensionErrorBoundary>
    </React.StrictMode>,
  );
}
