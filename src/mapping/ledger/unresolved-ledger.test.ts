/** Tests for unresolved ledger timestamp stability and record updates. */
// src/mapping/ledger/unresolved-ledger.test.ts

import { describe, expect, it, vi } from 'vitest';
import { UnresolvedLedger } from './unresolved-ledger';

describe('UnresolvedLedger', () => {
  it('keeps updatedAt stable when the unresolved title does not change', () => {
    const ledger = new UnresolvedLedger();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    expect(ledger.record('sonarr', 1, 'Title')).toBe(true);
    const first = ledger.list()[0];

    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));

    expect(ledger.record('sonarr', 1, 'Title')).toBe(false);
    const second = ledger.list()[0];

    expect(first?.updatedAt).toBe(second?.updatedAt);
    vi.useRealTimers();
  });

  it('refreshes updatedAt when the unresolved title changes', () => {
    const ledger = new UnresolvedLedger();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    ledger.record('radarr', 2, 'Old Title');
    const first = ledger.list()[0];

    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));

    expect(ledger.record('radarr', 2, 'New Title')).toBe(true);
    const second = ledger.list()[0];

    expect(second?.updatedAt).toBeGreaterThan(first?.updatedAt ?? 0);
    expect(second?.title).toBe('New Title');
    vi.useRealTimers();
  });
});
