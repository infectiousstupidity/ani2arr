/** Immediate popup mount with shared styles loaded first. */
// src/entrypoints/popup/index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createExtensionQueryClient } from '@/queries/query-client';
import { QuickSettings } from './popup-app';
import './style.css';

const queryClient = createExtensionQueryClient();
const rootElement = document.querySelector('#popup-root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <QuickSettings />
      </QueryClientProvider>
    </React.StrictMode>
  );
}
