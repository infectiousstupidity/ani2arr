// src/entrypoints/options/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import SettingsForm from '@/shared/components/settings-form';
import './style.css';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';

const queryClient = new QueryClient();

const OptionsHeader: React.FC = () => (
  <header className="mb-4 py-4 flex flex-col items-center justify-center">
    <div className="flex items-center gap-4">
      <img src="/icons/128.png" alt="Logo" className="h-12 w-12 rounded-lg" />
      <h1 className="text-4xl font-bold">ani2arr</h1>
    </div>
    <p className="text-lg text-text-secondary text-center mt-2">
      Configure your Sonarr connection and default settings.
    </p>
  </header>
);

const OptionsPage: React.FC = React.memo(() => {
  return (
    <div className="mx-auto max-w-lg p-4 bg-bg-primary text-text-primary relative">
      <OptionsHeader />
      <SettingsForm />
    </div>
  );
});
OptionsPage.displayName = "OptionsPage";

// Find the root element and render the app.
const rootElement = document.getElementById('options-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmProvider>
            <OptionsPage />
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
