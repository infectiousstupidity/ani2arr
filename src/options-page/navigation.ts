/** Options-page route config and hash helpers. */
// src/options-page/navigation.ts

import type React from 'react';
import {
  AdvancedIcon,
  MappingsIcon,
  RadarrIcon,
  SonarrIcon,
  UiActionsIcon,
} from '@/options-page/components/sidebar-icons';

export type SectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';
export type SectionGroup = 'services' | 'extension';
export type AdvancedPanelId = 'privacy' | null;

export interface SectionConfig {
  id: SectionId;
  label: string;
  description: string;
  path: string;
  group: SectionGroup;
  icon: React.ComponentType<{ className?: string }>;
}

export const sections: SectionConfig[] = [
  {
    id: 'sonarr',
    label: 'Sonarr',
    description: 'Connect Sonarr, review status, and set series defaults.',
    path: '/options/sonarr',
    group: 'services',
    icon: SonarrIcon,
  },
  {
    id: 'radarr',
    label: 'Radarr',
    description: 'Connect Radarr, review status, and set movie defaults.',
    path: '/options/radarr',
    group: 'services',
    icon: RadarrIcon,
  },
  {
    id: 'mappings',
    label: 'Mappings & overrides',
    description: 'Manage AniList mappings and overrides.',
    path: '/options/mappings',
    group: 'extension',
    icon: MappingsIcon,
  },
  {
    id: 'ui',
    label: 'UI & actions',
    description: 'Control provider-specific overlay and page actions.',
    path: '/options/ui',
    group: 'extension',
    icon: UiActionsIcon,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Diagnostics, reset, and upcoming tools.',
    path: '/options/advanced',
    group: 'extension',
    icon: AdvancedIcon,
  },
];

export const navGroups: Array<{ title: string; group: SectionGroup }> = [
  { title: 'Services', group: 'services' },
  { title: 'Extension', group: 'extension' },
];

export const resolveSectionFromHash = (hash: string): SectionId => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const withoutQuery = cleaned.split('?')[0] ?? '';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const normalizedId = normalized.replace(/^\//, '');

  if (normalizedId === 'connections' || normalizedId === 'defaults') {
    return 'sonarr';
  }

  const matchByPath = sections.find(section => section.path === normalized);
  if (matchByPath) return matchByPath.id;

  const matchById = sections.find(section => section.id === cleaned || section.id === normalizedId);
  return matchById?.id ?? 'sonarr';
};

export const getInitialSection = (): SectionId => {
  if (globalThis.window === undefined) return 'sonarr';
  return resolveSectionFromHash(globalThis.window.location.hash);
};

export const getSectionUrlHash = (
  sectionId: SectionId,
  targetAnilistId: number | null,
  advancedPanel: AdvancedPanelId,
): string => {
  const section = sections.find(entry => entry.id === sectionId) ?? sections[0];
  if (!section) return '/options/sonarr';

  if (sectionId === 'mappings' && typeof targetAnilistId === 'number') {
    return `${section.path}?anilistId=${targetAnilistId}`;
  }

  if (sectionId === 'advanced' && advancedPanel === 'privacy') {
    return `${section.path}?panel=privacy`;
  }

  return section.path;
};

export const syncOptionsLocation = (
  sectionId: SectionId,
  targetAnilistId: number | null,
  advancedPanel: AdvancedPanelId,
): void => {
  const section = sections.find(entry => entry.id === sectionId) ?? sections[0];
  if (!section || globalThis.window === undefined) return;

  const url = new URL(globalThis.window.location.href);
  url.hash = getSectionUrlHash(sectionId, targetAnilistId, advancedPanel);
  globalThis.window.history.replaceState(null, '', url);
  document.title = `ani2arr - ${section.label}`;
};

export const extractTargetAnilistIdFromHash = (hash: string): number | null => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const query = cleaned.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const raw = params.get('anilistId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const extractAdvancedPanelFromHash = (hash: string): AdvancedPanelId => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const withoutQuery = cleaned.split('?')[0] ?? '';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  if (normalized !== '/options/advanced') return null;

  const query = cleaned.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  return params.get('panel') === 'privacy' ? 'privacy' : null;
};
