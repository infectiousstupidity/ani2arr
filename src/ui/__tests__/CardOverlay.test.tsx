import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CardOverlayProps } from '../BrowseOverlay';
import { CardOverlay } from '../BrowseOverlay';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type SeriesStatusStub = {
  data: Partial<{ exists: boolean; anilistTvdbLinkMissing: boolean }> | null;
  isError: boolean;
  error: unknown;
  isLoading: boolean;
  fetchStatus: 'idle' | 'fetching';
  refetch: ReturnType<typeof vi.fn>;
};

type AddSeriesStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
  reset: ReturnType<typeof vi.fn>;
};

const createStatusStub = (overrides: Partial<SeriesStatusStub> = {}): SeriesStatusStub => ({
  data: null,
  isError: false,
  error: null,
  isLoading: false,
  fetchStatus: 'idle',
  refetch: vi.fn(() => Promise.resolve()),
  ...overrides,
});

const createAddSeriesStub = (overrides: Partial<AddSeriesStub> = {}): AddSeriesStub => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null,
  reset: vi.fn(),
  ...overrides,
});

const useSeriesStatusMock = vi.fn<[], SeriesStatusStub>();
const useAddSeriesMock = vi.fn<[], AddSeriesStub>();
const useThemeMock = vi.fn();
const tooltipCalls: Array<{ content?: React.ReactNode; children: React.ReactNode }> = [];

vi.mock('@/hooks/use-api-queries', () => ({
  __esModule: true,
  useSeriesStatus: () => useSeriesStatusMock(),
  useAddSeries: () => useAddSeriesMock(),
}));

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
  defaultForm: {
    qualityProfileId: 1,
    rootFolderPath: '/media',
    seriesType: 'standard',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
};

let statusStub: SeriesStatusStub;
let addSeriesStub: AddSeriesStub;
let openOptionsMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  statusStub = createStatusStub();
  addSeriesStub = createAddSeriesStub();
  useSeriesStatusMock.mockImplementation(() => statusStub);
  useAddSeriesMock.mockImplementation(() => addSeriesStub);
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
    const reactPropsKey = Object.keys(quickButton).find(key => key.startsWith('__reactProps$'));
    const reactProps = reactPropsKey ? (quickButton as Record<string, unknown>)[reactPropsKey] : null;
    expect(typeof reactProps?.onClick).toBe('function');
    (reactProps?.onClick as ((event: React.MouseEvent<HTMLButtonElement>) => void) | undefined)?.({
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
    useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Resolving series mapping.' });
    expect(quickButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resolving series mapping.' }).querySelector('.kitsunarr-card-overlay__spinner')).not.toBeNull();
    const reactKey = Object.keys(quickButton).find(key => key.startsWith('__reactProps$'));
    const reactProps = reactKey ? (quickButton as Record<string, unknown>)[reactKey] : null;
    (reactProps as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | null)?.onClick?.(
      {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.MouseEvent<HTMLButtonElement>,
    );
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });

  it('shows adding state while mutation is pending', () => {
    addSeriesStub = createAddSeriesStub({ isPending: true });
    useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Adding to Sonarr.' });
    expect(quickButton).toBeDisabled();
    const reactKey = Object.keys(quickButton).find(key => key.startsWith('__reactProps$'));
    const reactProps = reactKey ? (quickButton as Record<string, unknown>)[reactKey] : null;
    (reactProps as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | null)?.onClick?.(
      {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.MouseEvent<HTMLButtonElement>,
    );
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });

  it('retries mapping when the link is missing', async () => {
    const refetch = vi.fn(() => Promise.reject(new Error('retry failed')));
    statusStub = createStatusStub({ data: { anilistTvdbLinkMissing: true }, refetch });
    useSeriesStatusMock.mockImplementation(() => statusStub);

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
    useAddSeriesMock.mockImplementation(() => addSeriesStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Retry adding to Sonarr' });
    fireEvent.click(quickButton);

    expect(addSeriesStub.reset).toHaveBeenCalled();
    expect(addSeriesStub.mutate).toHaveBeenCalledWith({
      anilistId: baseProps.anilistId,
      title: baseProps.title,
      primaryTitleHint: baseProps.title,
      form: baseProps.defaultForm,
    });
  });

  it('refetches when status query errors', async () => {
    const refetch = vi.fn(() => Promise.reject(new Error('status failed')));
    statusStub = createStatusStub({ isError: true, error: { userMessage: 'Status error' }, refetch });
    useSeriesStatusMock.mockImplementation(() => statusStub);

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
    useAddSeriesMock.mockImplementation(() => addSeriesStub);

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
    useAddSeriesMock.mockImplementation(() => addSeriesStub);

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
      form: baseProps.defaultForm,
    });

    const gearButton = screen.getByRole('button', { name: 'Open advanced Sonarr options' });
    fireEvent.click(gearButton);
    expect(baseProps.onOpenModal).toHaveBeenCalledWith(baseProps.anilistId, baseProps.title);
  });

  it('displays the in-sonarr state', () => {
    statusStub = createStatusStub({ data: { exists: true } });
    useSeriesStatusMock.mockImplementation(() => statusStub);

    render(<CardOverlay {...baseProps} />);

    const quickButton = screen.getByRole('button', { name: 'Already in Sonarr' });
    expect(quickButton).toBeDisabled();
    expect(document.querySelector('[data-state="in-sonarr"]')).toBeInTheDocument();
    const reactKey = Object.keys(quickButton).find(key => key.startsWith('__reactProps$'));
    const reactProps = reactKey ? (quickButton as Record<string, unknown>)[reactKey] : null;
    (reactProps as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | null)?.onClick?.(
      {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.MouseEvent<HTMLButtonElement>,
    );
    expect(addSeriesStub.mutate).not.toHaveBeenCalled();
  });
});
