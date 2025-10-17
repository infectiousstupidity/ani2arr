import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@radix-ui/react-tooltip';

// no shared helpers needed here; using minimal hoisted spies

const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }));

// Hoisted spies + vi.mock factory for use-api-queries
const hoistedApi = vi.hoisted(() => ({
  useSeriesStatusMock: vi.fn(),
  useAddSeriesMock: vi.fn(),
  useExtensionOptionsMock: vi.fn(() => ({ data: null })),
}));
vi.mock('@/hooks/use-api-queries', () => ({
  __esModule: true,
  useSeriesStatus: (..._args: unknown[]) => hoistedApi.useSeriesStatusMock(..._args),
  useAddSeries: () => hoistedApi.useAddSeriesMock(),
  useExtensionOptions: () => ({ data: { sonarrUrl: 'http://sonarr.local' } }),
  useSonarrMetadata: () => ({ data: null }),
  useTestConnection: () => ({ mutate: vi.fn() }),
  useSaveOptions: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/utils/logger', () => ({
  __esModule: true,
  logger: { create: () => ({ debug: debugMock }) },
}));

import SonarrActionGroup from '../SonarrActionGroup';

const renderWithTooltipProvider = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

afterEach(() => {
  vi.clearAllMocks();
  debugMock.mockReset();
});

describe('SonarrActionGroup', () => {
  it('enables quick add when addable and triggers handlers', () => {
    const onQuickAdd = vi.fn();
    const onOpenModal = vi.fn();

    renderWithTooltipProvider(
      <SonarrActionGroup
        status="NOT_IN_SONARR"
        seriesTitleSlug="slug"
        animeTitle="Anime"
        resolvedSearchTerm="Anime"
        tvdbId={42}
        onQuickAdd={onQuickAdd}
        onOpenModal={onOpenModal}
      />,
    );

    const quickAdd = screen.getByRole('button', { name: 'Add to Sonarr' });
    expect(quickAdd).toBeEnabled();
    fireEvent.click(quickAdd);
    expect(onQuickAdd).toHaveBeenCalledTimes(1);

    const settingsButton = screen.getByRole('button', { name: 'Advanced options' });
    fireEvent.click(settingsButton);
    expect(onOpenModal).toHaveBeenCalledTimes(1);

    const externalLink = screen.getByRole('link');
    expect(externalLink.getAttribute('href')).toBe('http://sonarr.local/add/new?term=Anime');
    fireEvent.click(externalLink);
    expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('Add New page'));
  });

  it('renders success state when in Sonarr and uses slug link', () => {
    const onQuickAdd = vi.fn();
    const onOpenModal = vi.fn();

    renderWithTooltipProvider(
      <SonarrActionGroup
        status="IN_SONARR"
        seriesTitleSlug="series-slug"
        animeTitle="Anime"
        resolvedSearchTerm="Anime"
        tvdbId={42}
        onQuickAdd={onQuickAdd}
        onOpenModal={onOpenModal}
      />,
    );

  const inSonarrBtn = screen.getByRole('button', { name: 'In Sonarr' });
  expect(inSonarrBtn).toBeDisabled();
    const externalLink = screen.getByRole('link');
    fireEvent.click(externalLink);
    expect(externalLink.getAttribute('href')).toBe('http://sonarr.local/series/series-slug');
    expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('series-slug'));
  });

  it('disables controls when tvdb id is missing', () => {
    const onQuickAdd = vi.fn();

    renderWithTooltipProvider(
      <SonarrActionGroup
        status="ERROR"
        seriesTitleSlug={undefined}
        animeTitle="Anime"
        resolvedSearchTerm="Anime"
        tvdbId={null}
        onQuickAdd={onQuickAdd}
        onOpenModal={vi.fn()}
      />,
    );

  const cannotAddBtn = screen.getByRole('button', { name: 'Cannot add' });
  expect(cannotAddBtn).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Advanced options' })).toBeDisabled();
  });

  it('renders loading and error states based on status', () => {
    const { rerender } = renderWithTooltipProvider(
      <SonarrActionGroup
        status="LOADING"
        seriesTitleSlug="slug"
        animeTitle="Anime"
        resolvedSearchTerm="Anime"
        tvdbId={42}
        onQuickAdd={vi.fn()}
        onOpenModal={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Checking Sonarr...' })).toBeDisabled();

    rerender(
      <TooltipProvider>
        <SonarrActionGroup
          status="ADDING"
          seriesTitleSlug="slug"
          animeTitle="Anime"
          resolvedSearchTerm="Anime"
          tvdbId={42}
          onQuickAdd={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();

    rerender(
      <TooltipProvider>
        <SonarrActionGroup
          status="ERROR"
          seriesTitleSlug="slug"
          animeTitle="Anime"
          resolvedSearchTerm="Anime"
          tvdbId={42}
          onQuickAdd={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Error' })).toBeDisabled();
  });
});
