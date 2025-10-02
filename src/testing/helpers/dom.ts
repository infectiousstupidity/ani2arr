import { vi } from 'vitest';

export const flushAsync = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export const setLocationHref = (href: string): void => {
  const url = new URL(href);
  const mockLocation: Partial<Location> = {
    href: url.href,
    pathname: url.pathname,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    toString: () => url.href,
  };

  Object.defineProperty(window, 'location', {
    configurable: true,
    enumerable: true,
    value: mockLocation,
  });

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    enumerable: true,
    value: window.location,
  });
};
