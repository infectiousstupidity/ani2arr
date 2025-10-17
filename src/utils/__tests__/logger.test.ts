import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/utils/logger';

const initialLevels = {
  debug: logger.isLevelEnabled('debug'),
  info: logger.isLevelEnabled('info'),
  warn: logger.isLevelEnabled('warn'),
  error: logger.isLevelEnabled('error'),
};
const initialEnabled = initialLevels.debug && initialLevels.info && initialLevels.warn;

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error';

const noop = () => {};

describe('logger', () => {
  const consoleSpies: Partial<Record<ConsoleMethod, ReturnType<typeof vi.spyOn>>> = {};

  beforeEach(() => {
    consoleSpies.debug = vi.spyOn(console, 'debug').mockImplementation(noop);
    consoleSpies.info = vi.spyOn(console, 'info').mockImplementation(noop);
    consoleSpies.warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    consoleSpies.error = vi.spyOn(console, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    logger.configure({ enabled: initialEnabled, levels: initialLevels });
    vi.restoreAllMocks();
  });

  it('enables log levels based on the current build environment', () => {
    const isDev = Boolean(import.meta.env?.DEV);

    expect(logger.isLevelEnabled('debug')).toBe(isDev);
    expect(logger.isLevelEnabled('info')).toBe(isDev);
    expect(logger.isLevelEnabled('warn')).toBe(isDev);
    expect(logger.isLevelEnabled('error')).toBe(true);
  });

  it('allows overriding level enablement via configure', () => {
    logger.configure({ enabled: false, levels: { warn: true } });

    expect(logger.isLevelEnabled('debug')).toBe(false);
    expect(logger.isLevelEnabled('info')).toBe(false);
    expect(logger.isLevelEnabled('warn')).toBe(true);
    expect(logger.isLevelEnabled('error')).toBe(true);
  });

  it('emits scoped prefixes and preserves payload formatting', () => {
    logger.configure({ enabled: true, levels: { debug: true, info: true, warn: true, error: true } });
    const scoped = logger.create('Matching');

    scoped.info('fetch', { attempt: 1 });
    expect(consoleSpies.info).toHaveBeenCalledWith('[Kitsunarr | Matching] fetch', { attempt: 1 });

    scoped.warn({ reason: 'timeout' }, 'retrying');
    expect(consoleSpies.warn).toHaveBeenCalledWith('[Kitsunarr | Matching]', { reason: 'timeout' }, 'retrying');
  });

  it('redacts sensitive fields from objects before logging', () => {
    logger.configure({ enabled: true, levels: { debug: true, info: true, warn: true, error: true } });
    const scoped = logger.create('Secrets');

    const payload = {
      sonarrApiKey: 'SECRET123',
      other: 'value',
      nested: { apiKey: 'SHOULD_BE_REDACTED', ok: true },
      list: [{ token: 'TOKEN' }, 'x'],
    };

    scoped.info('sensitive', payload);

    // First argument should be the prefixed message string, second the redacted object
    expect(consoleSpies.info).toHaveBeenCalled();
    const call = (consoleSpies.info as ReturnType<typeof vi.spyOn>).mock.calls[0]!;
    expect(call).toBeDefined();
    expect(call[0]).toBe('[Kitsunarr | Secrets] sensitive');
    expect(call[1]).toEqual({
      sonarrApiKey: '[REDACTED]',
      other: 'value',
      nested: { apiKey: '[REDACTED]', ok: true },
      list: [{ token: '[REDACTED]' }, 'x'],
    });
  });

  it('always emits errors even when other levels are disabled', () => {
    logger.configure({ enabled: false, levels: { error: true } });

    logger.error('catastrophic failure');
    logger.debug('this should be suppressed');

    expect(consoleSpies.error).toHaveBeenCalledWith('[Kitsunarr] catastrophic failure');
    expect(consoleSpies.debug).not.toHaveBeenCalledWith('[Kitsunarr] this should be suppressed');
    expect(consoleSpies.debug?.mock.calls.length ?? 0).toBe(0);
  });
});
