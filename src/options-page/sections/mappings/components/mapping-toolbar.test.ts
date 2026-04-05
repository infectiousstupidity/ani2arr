/** Tests for mapping toolbar scope filters and source sets. */
// src/options-page/sections/mappings/components/mapping-toolbar.test.ts

import { describe, expect, it } from 'vitest';
import { ALL_MAPPING_SOURCES, getScopeSourceFilters } from './mapping-toolbar';

describe('mapping toolbar scopes', () => {
  it('keeps suppressed scope limited to rejected and ignored', () => {
    expect([...getScopeSourceFilters('suppressed')].toSorted()).toEqual(['ignored', 'rejected']);
  });

  it('keeps needs-attention scope free of removed source values', () => {
    expect([...getScopeSourceFilters('needs-attention')].toSorted()).toEqual(['ignored', 'manual', 'rejected', 'unresolved']);
    expect(ALL_MAPPING_SOURCES).toEqual(['manual', 'unresolved', 'rejected', 'ignored', 'auto', 'upstream']);
  });
});
