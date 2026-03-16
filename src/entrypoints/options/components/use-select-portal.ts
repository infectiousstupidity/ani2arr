import { useEffect, useState } from 'react';

export const useSelectPortal = () => {
  const [element] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null;

    const portalId = 'a2a-select-portal-container';
    const existing = document.getElementById(portalId);
    if (existing) return existing;

    const next = document.createElement('div');
    next.id = portalId;
    next.setAttribute('aria-hidden', 'true');
    next.style.position = 'relative';
    next.style.zIndex = '9999';
    next.setAttribute('data-a2a-created', 'true');
    document.body.appendChild(next);
    return next;
  });

  useEffect(() => {
    if (!element) return undefined;

    if (!element.isConnected) {
      document.body.appendChild(element);
    }

    return () => {
      if (element.getAttribute('data-a2a-created') === 'true' && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    };
  }, [element]);

  return element;
};
