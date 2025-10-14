import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { resolveViaPipeline } from '@/services/mapping/pipeline';
import type { MappingContext, AniMedia } from '@/services/mapping/types';
import type { SonarrLookupSeries } from '@/types';
import { canonicalTitleKey } from '@/utils/matching';
import type { SearchTerm } from '@/services/mapping/search-term-generator';
import type { ScoredCandidate } from '@/services/mapping/types';
import type { AnilistApiService } from '@/api/anilist.api';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type { ScopedLogger } from '@/utils/logger';
import type { SonarrLookupClient, SonarrLookupCredentials } from '@/services/mapping/sonarr-lookup.client';

vi.mock('@/services/mapping/scoring', () => ({
  scoreCandidates: vi.fn((term: SearchTerm, results: SonarrLookupSeries[]) =>
    results.map((r: SonarrLookupSeries) => ({ term, result: r, score: (r as unknown as { score?: number }).score ?? 0 } as ScoredCandidate)),
  ),
}));

vi.mock('@/services/mapping/early-stop', () => ({
  maybeEarlyStop: vi.fn((_batch: ScoredCandidate[], _limits: { earlyStopThreshold: number; scoreThreshold: number }) => ({ stop: false })),
  pickBest: vi.fn((overall: ScoredCandidate[], threshold: number) => {
    const top = overall[0];
    return top && top.score >= threshold ? top : undefined;
  }),
}));

vi.mock('@/services/mapping/search-term-generator', () => ({
  generateSearchTerms: vi.fn((_title: unknown, _synonyms: unknown) => [
    { canonical: 'canon-a', display: 'Term A' },
    { canonical: 'canon-b', display: 'Term B' },
  ] as SearchTerm[]),
  isSeasonalCanonicalTokens: vi.fn(() => false),
}));

describe('resolveViaPipeline', () => {
  const media: AniMedia = {
    id: 1,
  title: { romaji: 'X', english: 'Y', native: 'Z' } as unknown as AniMedia['title'],
  startDate: { year: 2024 },
    synonyms: [],
    format: 'TV',
  };

  let ctx: MappingContext;
  type LookupClientMock = {
    lookup: Mock<(canonical: string, display: string, creds: SonarrLookupCredentials) => Promise<SonarrLookupSeries[]>>;
    readFromCache: Mock<(canonical: string) => Promise<SonarrLookupSeries[]>>;
  };
  let lookupClient: LookupClientMock;

  beforeEach(() => {
  const lookup: LookupClientMock['lookup'] = vi.fn(async (_canonical: string, _display: string, _creds: SonarrLookupCredentials) => [] as SonarrLookupSeries[]);
  const readFromCache: LookupClientMock['readFromCache'] = vi.fn(async (_canonical: string) => [] as SonarrLookupSeries[]);
  lookupClient = { lookup, readFromCache };
    ctx = {
      anilistApi: {} as unknown as AnilistApiService,
      lookupClient: lookupClient as unknown as SonarrLookupClient,
      staticProvider: {} as unknown as StaticMappingProvider,
      credentials: { url: 'https://sonarr.local', apiKey: 'abc' },
      sessionSeenCanonical: new Set<string>(),
      limits: { maxTerms: 5, scoreThreshold: 0.76, earlyStopThreshold: 0.82 },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ScopedLogger,
    };
  });

  it('prioritizes primaryTitleHint before generated terms', async () => {
    const hint = 'Custom Synonym';
    const expectedCanonical = canonicalTitleKey(hint.toLowerCase())!;
    const { maybeEarlyStop } = await import('@/services/mapping/early-stop');
    (maybeEarlyStop as unknown as Mock).mockImplementationOnce((_batch: ScoredCandidate[], _limits: { earlyStopThreshold: number; scoreThreshold: number }) => ({ stop: true, pick: {
      term: { canonical: expectedCanonical, display: hint },
      result: { tvdbId: 555 } as SonarrLookupSeries,
      score: 0.9,
    }}));

    lookupClient.lookup.mockResolvedValueOnce([{ tvdbId: 555, title: '555' }]);

    const out = await resolveViaPipeline(media, ctx, hint);
    expect(lookupClient.lookup).toHaveBeenCalledWith(expectedCanonical, hint, ctx.credentials);
    expect(out).toEqual({ status: 'resolved', tvdbId: 555, confidence: 0.9, successfulSynonym: hint });
  });

  it('uses readFromCache when canonical already seen in session', async () => {
    ctx.sessionSeenCanonical.add('canon-a');
    const { maybeEarlyStop } = await import('@/services/mapping/early-stop');
    (maybeEarlyStop as unknown as Mock).mockReturnValueOnce({ stop: true, pick: {
      term: { canonical: 'canon-a', display: 'Term A' },
      result: { tvdbId: 777 } as SonarrLookupSeries,
      score: 0.88,
    }});

    lookupClient.readFromCache.mockResolvedValueOnce([{ tvdbId: 777, title: '777' }]);
    const out = await resolveViaPipeline(media, ctx);
    expect(lookupClient.readFromCache).toHaveBeenCalledWith('canon-a');
    expect(lookupClient.lookup).not.toHaveBeenCalledWith('canon-a', expect.anything(), expect.anything());
    expect(out).toEqual({ status: 'resolved', tvdbId: 777, confidence: 0.88, successfulSynonym: 'Term A' });
  });

  it('falls back to pickBest when no early stop', async () => {
  const { maybeEarlyStop, pickBest } = await import('@/services/mapping/early-stop');
  (maybeEarlyStop as unknown as Mock).mockReturnValue({ stop: false });
  (pickBest as unknown as Mock).mockImplementation((overall: ScoredCandidate[]) => overall[0]);

  lookupClient.lookup.mockResolvedValueOnce([{ tvdbId: 999, title: '999' }]);
    const out = await resolveViaPipeline(media, ctx);
    expect(out).toEqual({ status: 'resolved', tvdbId: 999, confidence: 0.8, successfulSynonym: 'Term A' });
  });
});