import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBrowserMock } from '@/testing';

const registerKitsunarrApi = vi.fn();
const initMappings = vi.fn(async () => {});
const getKitsunarrApi = vi.fn(() => ({ initMappings }));
const computeTitleMatchScore = vi.fn();

vi.mock('wxt/browser', () => createBrowserMock(fakeBrowser));

vi.mock('@/services', () => ({
  registerKitsunarrApi,
  getKitsunarrApi,
}));

vi.mock('@/utils/matching', () => ({
  computeTitleMatchScore,
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    create: () => ({
      info: vi.fn(),
    }),
  },
}));

async function bootstrapBackground() {
  const openOptionsSpy = vi
    .spyOn(fakeBrowser.runtime, 'openOptionsPage')
    .mockResolvedValue();
  const module = await import('@/entrypoints/background');
  await module.default.main?.();
  return { openOptionsSpy };
}

const FALLBACK_INTERVAL_KEY = '__kitsunarr_fallback_interval__';
const NO_SENDER = undefined as unknown as Parameters<typeof fakeBrowser.runtime.onMessage.trigger>[1];

describe('background entrypoint', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.runtime?.resetState?.();
    fakeBrowser.alarms?.resetState?.();
    initMappings.mockClear();
    registerKitsunarrApi.mockClear();
    getKitsunarrApi.mockClear();
    computeTitleMatchScore.mockReset();
  });

  afterEach(() => {
    const intervalHandle = (globalThis as Record<string, unknown>)[FALLBACK_INTERVAL_KEY];
    if (intervalHandle) {
      // Node timers are objects; browsers return numbers.
      clearInterval(intervalHandle as NodeJS.Timeout);
      delete (globalThis as Record<string, unknown>)[FALLBACK_INTERVAL_KEY];
    }
  });

  it('initialises services on install and schedules periodic refresh via alarms', async () => {
    const createSpy = vi.spyOn(fakeBrowser.alarms, 'create');

    const { openOptionsSpy } = await bootstrapBackground();

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'install',
    } as Parameters<typeof fakeBrowser.runtime.onInstalled.trigger>[0]);

    expect(registerKitsunarrApi).toHaveBeenCalledTimes(1);
    expect(getKitsunarrApi).toHaveBeenCalledTimes(1);
    expect(initMappings).toHaveBeenCalledTimes(1);
    expect(openOptionsSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith('kitsunarr:refresh-static-mappings', {
      periodInMinutes: 360,
    });
  });

  it('initialises services on startup and falls back to setInterval when alarms API missing', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const alarms = fakeBrowser.alarms;
    // Simulate environment without alarms API.
    delete (fakeBrowser as Partial<typeof fakeBrowser>).alarms;

    const { openOptionsSpy } = await bootstrapBackground();
    openOptionsSpy.mockClear();

    await fakeBrowser.runtime.onStartup.trigger();

    expect(initMappings).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 360 * 60 * 1000);
    expect((globalThis as Record<string, unknown>)[FALLBACK_INTERVAL_KEY]).toBeDefined();
    // No options page should be opened during startup.
    expect(openOptionsSpy).not.toHaveBeenCalled();

    (fakeBrowser as Partial<typeof fakeBrowser>).alarms = alarms;
  });

  it('handles runtime messages for options, mapping refresh, and score batches', async () => {
    const { openOptionsSpy } = await bootstrapBackground();

    computeTitleMatchScore
      .mockReturnValueOnce(0.42)
      .mockReturnValueOnce(0.84);

    await fakeBrowser.runtime.onMessage.trigger({ type: 'OPEN_OPTIONS_PAGE' }, NO_SENDER);
    expect(openOptionsSpy).toHaveBeenCalledTimes(1);

    initMappings.mockClear();
    const [refreshResult] = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'kitsunarr:mapping:refresh' },
      NO_SENDER,
    );
    expect(initMappings).toHaveBeenCalledTimes(1);
    expect(refreshResult).toEqual({ ok: true });

    const [scoreResult] = await fakeBrowser.runtime.onMessage.trigger(
      {
        type: 'kitsunarr:match:score-batch',
        payload: {
          queryRaw: 'Cowboy Bebop',
          startYear: 1998,
          candidates: [
            { title: 'Cowboy Bebop', year: 1998, genres: ['Action', 'Sci-Fi'] },
            { title: 'Trigun', year: 1998 },
          ],
        },
      },
      NO_SENDER,
    );

    expect(computeTitleMatchScore).toHaveBeenNthCalledWith(1, {
      queryRaw: 'Cowboy Bebop',
      candidateRaw: 'Cowboy Bebop',
      candidateYear: 1998,
      targetYear: 1998,
      candidateGenres: ['Action', 'Sci-Fi'],
    });
    expect(computeTitleMatchScore).toHaveBeenNthCalledWith(2, {
      queryRaw: 'Cowboy Bebop',
      candidateRaw: 'Trigun',
      candidateYear: 1998,
      targetYear: 1998,
    });
    expect(scoreResult).toEqual({ scores: [0.42, 0.84] });
  });
});
