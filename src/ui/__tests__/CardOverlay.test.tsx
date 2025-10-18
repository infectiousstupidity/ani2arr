import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock, getReactHandler } from '@/testing';

import type { CardOverlayProps } from '@/ui/browse-overlay-types';
import { CardOverlay } from '@/ui/card-overlay';
import { createStatusStub, createAddSeriesStub, SeriesStatusStub, AddSeriesStub } from '@/testing/mocks/useApiQueriesMock';

type FakeBrowser = {
  runtime: {
    openOptionsPage: () => Promise<void>;
    sendMessage: () => Promise<void>;
    onMessage: {
      addListener: (listener: (...args: unknown[]) => unknown) => void;
      removeListener: (listener: (...args: unknown[]) => unknown) => void;
      hasListener: (listener: (...args: unknown[]) => unknown) => boolean;
    };
  };
};

vi.mock('wxt/browser', () => {
  const browser: FakeBrowser = {
    runtime: {
      openOptionsPage: () => Promise.resolve(),
      sendMessage: () => Promise.resolve(),
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
    },
  };

  return createBrowserMock(browser);
});

// Hoisted spies + vi.mock factory for use-api-queries
const hoisted = vi.hoisted(() => ({
  useSeriesStatusMock: vi.fn(),
  useAddSeriesMock: vi.fn(),
  useExtensionOptionsMock: vi.fn(() => ({ data: null })),
}));
vi.mock('@/hooks/use-api-queries', () => ({
  __esModule: true,
  useSeriesStatus: (..._args: unknown[]) => hoisted.useSeriesStatusMock(..._args),
  useAddSeries: () => hoisted.useAddSeriesMock(),
  useExtensionOptions: () => hoisted.useExtensionOptionsMock(),
  useSonarrMetadata: () => ({ data: null }),
  useTestConnection: () => ({ mutate: vi.fn() }),
  useSaveOptions: () => ({ mutate: vi.fn() }),
}));
const useThemeMock = vi.fn();
const tooltipCalls: Array<{ content?: React.ReactNode; children: React.ReactNode }> = [];

vi.mock('@/hooks/use-theme', () => ({
  __esModule: true,
  useTheme: (ref: React.RefObject<HTMLDivElement>) => useThemeMock(ref),
}));

vi.mock('@/ui/TooltipWrapper', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; content?: React.ReactNode }) => {
    tooltipCalls.push(props);
    return <>{props.children}</>;
  },
}));

const baseProps: CardOverlayProps = {
  anilistId: 1,
  title: 'Test',
  onOpenModal: vi.fn(),
  isConfigured: true,
  metadata: null,
  defaultForm: {
    qualityProfileId: 1,
    rootFolderPath: '/media',
    seriesType: 'standard',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
  sonarrUrl: null,
};

let statusStub: SeriesStatusStub;
let addSeriesStub: AddSeriesStub;
let openOptionsMock: ReturnType<typeof vi.fn>;
let fakeBrowser: FakeBrowser;

beforeEach(async () => {
  const browserModule = await import('wxt/browser');
  fakeBrowser = browserModule.browser as unknown as FakeBrowser;

  // Reset browser runtime handlers between tests.
  fakeBrowser.runtime.openOptionsPage = vi.fn(() => Promise.resolve());
  fakeBrowser.runtime.sendMessage = vi.fn(() => Promise.resolve());
  fakeBrowser.runtime.onMessage.addListener = vi.fn();
  fakeBrowser.runtime.onMessage.removeListener = vi.fn();
  fakeBrowser.runtime.onMessage.hasListener = vi.fn(() => false);
  statusStub = createStatusStub();
  addSeriesStub = createAddSeriesStub();
  hoisted.useSeriesStatusMock.mockImplementation(() => statusStub);
  hoisted.useAddSeriesMock.mockImplementation(() => addSeriesStub);
  useThemeMock.mockClear();
  tooltipCalls.length = 0;
  openOptionsMock = vi.fn(() => Promise.resolve());
  vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockImplementation(openOptionsMock);
  vi.stubGlobal('browser', fakeBrowser);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type ReactInternalProps = { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } & Record<string, unknown>;

function getReactInternalProps(
  element: HTMLElement,
): ReactInternalProps | null {
  const reactPropsKey = Object.keys(element).find(key => key.startsWith('__reactProps$'));
  return reactPropsKey
    ? (element as unknown as Record<string, unknown>)[reactPropsKey] as unknown as ReactInternalProps
    : null;
}

describe('CardOverlay', () => {
  it('disables quick add when Sonarr is not configured', async () => {
    render(
      <CardOverlay
        {...baseProps}
        isConfigured={false}
        defaultForm={null}
      />,
    );

    const quickButton = screen.getByRole('button', { name: 'Configure Sonarr before adding' });
    expect(quickButton).toBeDisabled();
    const reactProps = getReactInternalProps(quickButton);
    expect(typeof reactProps?.onClick).toBe('function');
    reactProps?.onClick?.({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as React.MouseEvent<HTMLButtonElement>);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledTimes(1);
      expect(window.alert).toHaveBeenCalledWith('Please configure your Sonarr settings first.');
      expect(openOptionsMock).toHaveBeenCalled();
    });
  });

  it('shows resolving state while status is loading', () => {
    statusStub = createStatusStub({ isLoading: true });
  hoisted.useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Resolving series mapping.' });
    expect(quickButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resolving series mapping.' }).querySelector('.kitsunarr-card-overlay__spinner')).not.toBeNull();
    const reactProps = getReactInternalProps(quickButton);
    reactProps?.onClick?.(
      {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.MouseEvent<HTMLButtonElement>,
    );
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });

  it('shows adding state while mutation is pending', () => {
    addSeriesStub = createAddSeriesStub({ isPending: true });
  hoisted.useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Adding to Sonarr.' });
    expect(quickButton).toBeDisabled();
    const onClick = getReactHandler(quickButton, 'onClick') as React.MouseEventHandler<HTMLButtonElement> | null;
    onClick?.({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as React.MouseEvent<HTMLButtonElement>);
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });

  it('retries mapping when the link is missing', async () => {
    const refetch = vi.fn(() => Promise.reject(new Error('retry failed')));
    statusStub = createStatusStub({ data: { anilistTvdbLinkMissing: true }, refetch });
  hoisted.useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Retry mapping lookup' });
    fireEvent.click(quickButton);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ throwOnError: false });
    });
  });

  it('resubmits add mutation when previous attempt failed', () => {
    addSeriesStub = createAddSeriesStub({
      isError: true,
      error: new Error('Add failed'),
      mutate: vi.fn(),
      reset: vi.fn(),
    });
  hoisted.useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Retry adding to Sonarr' });
    fireEvent.click(quickButton);

    expect(addSeriesStub.reset).toHaveBeenCalled();
    expect(addSeriesStub.mutate).toHaveBeenCalledWith({
      anilistId: baseProps.anilistId,
      title: baseProps.title,
      primaryTitleHint: baseProps.title,
      metadata: null,
      form: baseProps.defaultForm,
    });
  });

  it('refetches when status query errors', async () => {
    const refetch = vi.fn(() => Promise.reject(new Error('status failed')));
    statusStub = createStatusStub({ isError: true, error: { userMessage: 'Status error' }, refetch });
  hoisted.useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Retry adding to Sonarr' });
    fireEvent.click(quickButton);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ throwOnError: false });
    });
  });

  it('avoids quick add when defaults are missing', () => {
    render(
      <CardOverlay
        {...baseProps}
        defaultForm={null}
      />,
    );

    const quickButton = screen.getByRole('button', { name: 'Defaults unavailable' });
    fireEvent.click(quickButton);
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });

  it('does not retry add when defaults are missing after an error', () => {
    addSeriesStub = createAddSeriesStub({
      isError: true,
      error: new Error('Add failed'),
      mutate: vi.fn(),
      reset: vi.fn(),
    });
  hoisted.useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(
      <CardOverlay
        {...baseProps}
        defaultForm={null}
      />,
    );

    const quickButton = screen.getByRole('button', { name: 'Retry adding to Sonarr' });
    const initialResetCalls = addSeriesStub.reset.mock.calls.length;
    fireEvent.click(quickButton);
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
    expect(addSeriesStub.reset.mock.calls.length).toBe(initialResetCalls);
  });

  it('falls back to generic retry label when error lacks a message', () => {
    addSeriesStub = createAddSeriesStub({
      isError: true,
      error: { reason: 'unknown' },
      mutate: vi.fn(),
      reset: vi.fn(),
    });
  hoisted.useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Retry adding to Sonarr' });
    expect(tooltipCalls.some(call => call.content === 'Retry Sonarr add')).toBe(true);
    const initialResetCalls = addSeriesStub.reset.mock.calls.length;
    fireEvent.click(quickButton);
    expect(addSeriesStub.reset.mock.calls.length).toBe(initialResetCalls + 1);
    expect(addSeriesStub.mutate).toHaveBeenCalledWith({
      anilistId: baseProps.anilistId,
      title: baseProps.title,
      primaryTitleHint: baseProps.title,
      metadata: null,
      form: baseProps.defaultForm,
    });
  });

  it('quick adds and opens advanced options when addable', () => {
    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Quick add to Sonarr' });
    fireEvent.click(quickButton);
    expect(addSeriesStub.mutate).toHaveBeenCalledWith({
      anilistId: baseProps.anilistId,
      title: baseProps.title,
      primaryTitleHint: baseProps.title,
      metadata: null,
      form: baseProps.defaultForm,
    });

    const gearButton = screen.getByRole('button', { name: 'Open advanced Sonarr options' });
    fireEvent.click(gearButton);
  expect(baseProps.onOpenModal).toHaveBeenCalledWith(baseProps.anilistId, baseProps.title, null);
  });

  it('displays the in-sonarr state', () => {
    statusStub = createStatusStub({ data: { exists: true } });
  hoisted.useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Already in Sonarr' });
    expect(quickButton).toBeDisabled();
    expect(document.querySelector('[data-state="in-sonarr"]')).toBeInTheDocument();
    const onClick = getReactHandler(quickButton, 'onClick') as React.MouseEventHandler<HTMLButtonElement> | null;
    onClick?.({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as React.MouseEvent<HTMLButtonElement>);
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });
});
