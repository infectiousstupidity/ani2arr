import { fakeBrowser } from 'wxt/testing/fake-browser';

type BrowserMockModule<TBrowser> = {
  __esModule: true;
  default: TBrowser;
  browser: TBrowser;
};

export const createBrowserMock = <TBrowser extends object>(browserImpl?: TBrowser): BrowserMockModule<TBrowser> => {
  const instance = browserImpl ?? (fakeBrowser as unknown as TBrowser);
  return {
    __esModule: true,
    default: instance,
    browser: instance,
  };
};
