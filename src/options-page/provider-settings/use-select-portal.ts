/** Provider-settings portal container for options-page select menus and tooltips. */
// src/options-page/provider-settings/use-select-portal.ts

import { useEffect, useState } from 'react';

export const useSelectPortal = () => {
  const [element] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null;

    const portalId = 'a2a-select-portal-container';
    const existing = document.querySelector<HTMLElement>(`#${portalId}`);
    if (existing) return existing;

    const next = document.createElement('div');
    next.id = portalId;
    next.dataset.a2aCreated = 'true';
    next.ariaHidden = 'true';
    next.style.position = 'relative';
    next.style.zIndex = '9999';
    document.body.append(next);
    return next;
  });

  useEffect(() => {
    if (!element) return;

    if (!element.isConnected) {
      document.body.append(element);
    }

    return () => {
      if (element.dataset.a2aCreated === 'true') {
        element.remove();
      }
    };
  }, [element]);

  return element;
};
