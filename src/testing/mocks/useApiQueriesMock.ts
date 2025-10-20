// Centralized test helpers for mocking '@/hooks/use-api-queries'
import { vi } from 'vitest';

export type SeriesStatusStub = {
  data: unknown | null;
  isError: boolean;
  error: unknown;
  isLoading: boolean;
  fetchStatus: 'idle' | 'fetching';
  refetch: ReturnType<typeof vi.fn>;
};

export type AddSeriesStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
  reset: ReturnType<typeof vi.fn>;
};

export const createStatusStub = (overrides: Partial<SeriesStatusStub> = {}): SeriesStatusStub => ({
  data: null,
  isError: false,
  error: null,
  isLoading: false,
  fetchStatus: 'idle',
  refetch: vi.fn(() => Promise.resolve()),
  ...overrides,
});

export const createAddSeriesStub = (overrides: Partial<AddSeriesStub> = {}): AddSeriesStub => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null,
  reset: vi.fn(),
  ...overrides,
});

// Default hook implementations used by tests that don't override them
export const defaultUseApiQueries = () => ({
  // Match real hook signatures loosely to keep mocks flexible
  useSeriesStatus: (..._args: unknown[]) => {
    void _args;
    return createStatusStub();
  },
  useAddSeries: () => createAddSeriesStub(),
  usePublicOptions: () => ({ data: null as unknown | null }),
  useExtensionOptions: () => ({ data: null as unknown | null }),
  useSonarrMetadata: (_options?: unknown) => {
    void _options;
    return { data: null as unknown | null };
  },
  useTestConnection: () => ({ mutate: vi.fn() }),
  useSaveOptions: () => ({ mutate: vi.fn() }),
  useUpdateDefaultSettings: () => ({ mutate: vi.fn() }),
});

// Helper to set up a partial mock while preserving other exports from the original module
// Hoist-safe factory maker for use in `vi.mock` calls inside tests.
export const makeUseApiQueriesMock = (overrides?: Partial<ReturnType<typeof defaultUseApiQueries>>) => {
  const defaults = defaultUseApiQueries();
  return {
    __esModule: true,
    ...defaults,
    ...(overrides ?? {}),
  };
};

// Spies + vi.mock factory helpers designed to be used with vi.hoisted in tests.
export type UseApiQueriesSpies = {
  useSeriesStatusMock: ReturnType<typeof vi.fn>;
  useAddSeriesMock: ReturnType<typeof vi.fn>;
  usePublicOptionsMock: ReturnType<typeof vi.fn>;
  useExtensionOptionsMock: ReturnType<typeof vi.fn>;
};

// Create spies in a hoist-safe way: const spies = vi.hoisted(() => createUseApiQueriesSpies());
export const createUseApiQueriesSpies = (): UseApiQueriesSpies => ({
  useSeriesStatusMock: vi.fn(),
  useAddSeriesMock: vi.fn(),
  usePublicOptionsMock: vi.fn(() => ({ data: null as unknown | null })),
  useExtensionOptionsMock: vi.fn(() => ({ data: null as unknown | null })),
});

// Build a vi.mock factory object from spies. Safe to call inside vi.mock factory.
export const makeUseApiQueriesViMockFromSpies = (
  spies: UseApiQueriesSpies,
  overrides?: Partial<ReturnType<typeof defaultUseApiQueries>>,
) =>
  makeUseApiQueriesMock({
    useSeriesStatus: (...args: unknown[]) => spies.useSeriesStatusMock(...args),
    useAddSeries: () => spies.useAddSeriesMock(),
    usePublicOptions: () => spies.usePublicOptionsMock(),
    useExtensionOptions: () => spies.useExtensionOptionsMock(),
    ...(overrides ?? {}),
  });
export default defaultUseApiQueries;
