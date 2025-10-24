import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBrowserMock } from '@/testing';

vi.mock('wxt/browser', () => createBrowserMock(fakeBrowser));

const useAddSeriesManagerMock = vi.fn();
const useThemeMock = vi.fn();
const sonarrFormMock = vi.fn((props: Record<string, unknown>) => {
  const initialFocusRef = props.initialFocusRef as React.RefObject<HTMLButtonElement> | undefined;
  return (
    <div data-testid="sonarr-form">
      <button type="button" ref={initialFocusRef ?? null}>
        Form focus
      </button>
    </div>
  );
});

vi.mock('@/hooks/use-add-series-manager', () => ({
  __esModule: true,
  useAddSeriesManager: (anilistId: number, title: string, metadata: unknown | null, isOpen: boolean) =>
    useAddSeriesManagerMock({ anilistId, title, metadata, isOpen }),
}));

vi.mock('@/hooks/use-theme', () => ({
  __esModule: true,
  useTheme: (ref: React.RefObject<HTMLDivElement>) => useThemeMock(ref),
}));

vi.mock('@/ui/SonarrForm', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => sonarrFormMock(props),
}));

vi.mock('../TooltipWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AddSeriesModal from '../AddSeriesModal';

let sendMessageSpy: unknown;

const baseManager = () => ({
  formState: {
    qualityProfileId: 1,
    rootFolderPath: '/media',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
  sonarrMetadata: {
    data: {
      qualityProfiles: [],
      rootFolders: [],
      tags: [],
    },
  },
  isLoading: false,
  isDirty: false,
  sonarrReady: true,
  addSeriesState: {
    isPending: false,
    isSuccess: false,
  },
  saveDefaultsState: {
    isPending: false,
  },
  handleFormChange: vi.fn(),
  handleAddSeries: vi.fn(),
  handleSaveDefaults: vi.fn(),
});

const createManager = (overrides: Partial<ReturnType<typeof baseManager>> = {}) => ({
  ...baseManager(),
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    cb(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  sendMessageSpy = vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined as never);
  fakeBrowser.runtime.onMessage.addListener(() => undefined);
  useAddSeriesManagerMock.mockImplementation(() => createManager());
});

afterEach(() => {
  vi.clearAllMocks();
  useAddSeriesManagerMock.mockReset();
  sonarrFormMock.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AddSeriesModal', () => {
  it('renders configuration message when Sonarr is not ready', () => {
    useAddSeriesManagerMock.mockImplementation(() => createManager({ sonarrReady: false }));

    render(
      <AddSeriesModal
        anilistId={1}
        title="Test"
        isOpen
        onClose={vi.fn()}
        metadata={null}
      />,
    );

    expect(screen.getByText('Configure Sonarr to enable adding series.')).toBeInTheDocument();
  });

  it('renders loading state when metadata is unavailable', () => {
    // these overrides intentionally set parts of the manager to null to test
    // loading behavior; cast to `any`/Partial to satisfy strict types in TS
    useAddSeriesManagerMock.mockImplementation(() =>
      createManager(
        ({ sonarrMetadata: { data: null }, formState: null, isLoading: true } as unknown) as Partial<ReturnType<typeof baseManager>>,
      ),
    );

    render(
      <AddSeriesModal
        anilistId={1}
        title="Test"
        isOpen
        onClose={vi.fn()}
        metadata={null}
      />,
    );

    expect(screen.getByText('Loading Sonarr settings...')).toBeInTheDocument();
  });

  it('renders SonarrForm and handles actions when ready', async () => {
    const onClose = vi.fn();
    const manager = createManager({ isDirty: true });
    useAddSeriesManagerMock.mockImplementation(() => manager);
    render(
      <AddSeriesModal
        anilistId={1}
        title="Test"
        isOpen
        onClose={onClose}
        metadata={null}
      />,
    );

    expect(sonarrFormMock).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Save as Default' }));
    expect(manager.handleSaveDefaults).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add Series' }));
    expect(manager.handleAddSeries).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Open options page'));
    // spy type is intentionally loose for the fakeBrowser runtime; cast at assertion
    expect(sendMessageSpy as ReturnType<typeof vi.spyOn>).toHaveBeenCalledWith(
      expect.objectContaining({ _kitsunarr: true, type: 'OPEN_OPTIONS_PAGE' }),
    );

    expect(useThemeMock).toHaveBeenCalled();
    const focusButton = screen.getByRole('button', { name: 'Form focus' });
    const sonarrProps = sonarrFormMock.mock.calls.at(-1)?.[0] as { initialFocusRef?: React.RefObject<HTMLButtonElement> };
    expect(sonarrProps.initialFocusRef?.current).toBe(focusButton);
  });

  it('auto closes after successful add', () => {
    const onClose = vi.fn();
    useAddSeriesManagerMock.mockImplementation(() =>
      createManager({
        addSeriesState: {
          isPending: false,
          isSuccess: true,
        },
      }),
    );

    render(
      <AddSeriesModal
        anilistId={1}
        title="Test"
        isOpen
        onClose={onClose}
        metadata={null}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
