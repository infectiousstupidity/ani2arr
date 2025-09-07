// src/entrypoints/popup/index.tsx

/*
This entrypoint is deactivated because I couldn't get the Radix Select component to render the content in the popup context. 
I gave up.
*/ 

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsForm from '@/ui/SettingsForm';
import './style.css';
import { ExternalLinkIcon } from '@radix-ui/react-icons';
import Button from '@/ui/Button';
import { TooltipProvider } from '@radix-ui/react-tooltip';

const queryClient = new QueryClient();

const PopupPanel: React.FC = () => {
  return (
    <TooltipProvider>
      <div className="p-4 relative">
        <header className="flex items-center justify-between mb-4">
          {/* 1. Left Spacer: Balances the button on the right. An icon button is w-9. */}
          <div className="w-9" />

          {/* 2. Center Group: Expands to fill space and centers its content. */}
          <div className="flex flex-1 justify-center items-center gap-2">
            <img src="/icon/48.png" alt="Logo" className="h-8 w-8 rounded-md" />
            <h1 className="text-2xl font-bold">Kitsunarr</h1>
          </div>

          {/* 3. Right Button: Unchanged. */}
          <Button
            variant="ghost"
            size="icon"
            tooltip="Open in new tab"
            onClick={() => browser.runtime.openOptionsPage()}
          >
            <ExternalLinkIcon />
          </Button>
        </header>
        <SettingsForm />
      </div>
    </TooltipProvider>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <PopupPanel />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}