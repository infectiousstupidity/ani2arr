import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAddSeriesManager } from '../use-add-series-manager';
import {
  usePublicOptions,
  useSonarrMetadata,
  useAddSeries,
  useUpdateDefaultSettings,
} from '../use-api-queries';
import type { PublicOptions, SonarrFormState } from '@/types';
import { createSonarrDefaultsFixture } from '@/testing';

vi.mock('../use-api-queries', () => ({
  usePublicOptions: vi.fn(),
  useSonarrMetadata: vi.fn(),
  useAddSeries: vi.fn(),
  useUpdateDefaultSettings: vi.fn(),
}));

const mockedUsePublicOptions = vi.mocked(usePublicOptions);
const mockedUseSonarrMetadata = vi.mocked(useSonarrMetadata);
const mockedUseAddSeries = vi.mocked(useAddSeries);
const mockedUseUpdateDefaults = vi.mocked(useUpdateDefaultSettings);

type OptionsOverrides = Partial<Omit<PublicOptions, 'defaults'>> & {
  defaults?: Partial<SonarrFormState>;
};

const createOptions = (overrides: OptionsOverrides = {}): PublicOptions => {
  const { defaults: defaultsOverride, ...rest } = overrides;
  return {
    sonarrUrl: 'http://localhost:8989',
    isConfigured: true,
    defaults: createSonarrDefaultsFixture({
      qualityProfileId: 12,
      rootFolderPath: '/anime',
      seriesType: 'anime',
      monitorOption: 'all',
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [7, 9],
      ...defaultsOverride,
    }),
    ...rest,
  };
};

let currentOptions: PublicOptions | undefined;
let optionsLoading = false;
let metadataLoading = false;
let addSeriesMutateSpy: ReturnType<typeof vi.fn>;
let saveDefaultsMutateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  currentOptions = createOptions();
  optionsLoading = false;
  metadataLoading = false;
  addSeriesMutateSpy = vi.fn();
  saveDefaultsMutateSpy = vi.fn();

  mockedUsePublicOptions.mockImplementation(() => ({
    data: currentOptions,
    isLoading: optionsLoading,
  }) as unknown as ReturnType<typeof usePublicOptions>);

  mockedUseSonarrMetadata.mockImplementation(() => ({
    data: null,
    isLoading: metadataLoading,
  }) as unknown as ReturnType<typeof useSonarrMetadata>);

  mockedUseAddSeries.mockReturnValue({
    mutate: addSeriesMutateSpy,
    isPending: false,
  } as unknown as ReturnType<typeof useAddSeries>);

  mockedUseUpdateDefaults.mockReturnValue({
    mutate: saveDefaultsMutateSpy,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateDefaultSettings>);
});

describe('useAddSeriesManager', () => {
  it('initialises form state from options, tracks dirtiness, and resets when reopened', async () => {
    const initialOptions = createOptions({
      defaults: {
        rootFolderPath: '/anime/library',
        qualityProfileId: 22,
      },
    });
    currentOptions = initialOptions;

    const { result, rerender } = renderHook(({ isOpen }) => useAddSeriesManager(42, 'Test Series', null, isOpen), {
      initialProps: { isOpen: false },
    });

    expect(result.current.formState).toEqual(initialOptions.defaults);
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.handleFormChange('rootFolderPath', '/different/path');
    });

    expect(result.current.formState.rootFolderPath).toBe('/different/path');
    expect(result.current.isDirty).toBe(true);

    act(() => {
      rerender({ isOpen: true });
    });

    await waitFor(() => {
      expect(result.current.formState).toEqual(initialOptions.defaults);
      expect(result.current.isDirty).toBe(false);
    });
  });

  it('only attempts to add a series when Sonarr is configured', () => {
    currentOptions = createOptions({ isConfigured: false });

    const { result, rerender } = renderHook(({ isOpen }) => useAddSeriesManager(99, 'Ready Check', null, isOpen), {
      initialProps: { isOpen: false },
    });

    expect(result.current.sonarrReady).toBe(false);

    act(() => {
      result.current.handleAddSeries();
    });

    expect(addSeriesMutateSpy).not.toHaveBeenCalled();

    currentOptions = createOptions();

    act(() => {
      rerender({ isOpen: false });
    });

    expect(result.current.sonarrReady).toBe(true);

    act(() => {
      result.current.handleAddSeries();
    });

    expect(addSeriesMutateSpy).toHaveBeenCalledTimes(1);
    expect(addSeriesMutateSpy).toHaveBeenCalledWith({
      anilistId: 99,
      title: 'Ready Check',
      primaryTitleHint: 'Ready Check',
      metadata: null,
      form: result.current.formState,
    });
  });

  it('saves defaults only when dirty and merges updated form values', () => {
    currentOptions = createOptions();

    const { result } = renderHook(({ isOpen }) => useAddSeriesManager(77, 'Save Defaults', null, isOpen), {
      initialProps: { isOpen: false },
    });

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.handleSaveDefaults();
    });

    expect(saveDefaultsMutateSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.handleFormChange('monitorOption', 'future');
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.handleSaveDefaults();
    });

    expect(saveDefaultsMutateSpy).toHaveBeenCalledTimes(1);
    expect(saveDefaultsMutateSpy).toHaveBeenCalledWith(result.current.formState);
  });

  it('combines option and metadata loading states', () => {
    currentOptions = createOptions();

    const { result, rerender } = renderHook(({ isOpen }) => useAddSeriesManager(13, 'Loading Check', null, isOpen), {
      initialProps: { isOpen: false },
    });

    expect(result.current.isLoading).toBe(false);

    optionsLoading = true;
    act(() => {
      rerender({ isOpen: false });
    });

    expect(result.current.isLoading).toBe(true);

    optionsLoading = false;
    metadataLoading = true;
    act(() => {
      rerender({ isOpen: false });
    });

    expect(result.current.isLoading).toBe(true);

    metadataLoading = false;
    act(() => {
      rerender({ isOpen: false });
    });

    expect(result.current.isLoading).toBe(false);
  });
});
