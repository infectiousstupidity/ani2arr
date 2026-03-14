import type { MappingProvider } from '@/shared/types';

export const SETTINGS_SESSION_KEY = 'a2a_settings_epoch';
export const MAPPINGS_SESSION_KEY = 'a2a_mappings_epoch';
export const LIBRARY_SESSION_KEYS: Record<MappingProvider, string> = {
  sonarr: 'a2a_library_epoch_sonarr',
  radarr: 'a2a_library_epoch_radarr',
};

export const CLIENT_STORAGE_RESET_TOPIC = 'client-storage-reset';
export const CLIENT_STORAGE_RESET_MESSAGE_TYPE = 'a2a:client-storage:reset';

export function clearA2aSessionStorage(): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  sessionStorage.removeItem(SETTINGS_SESSION_KEY);
  sessionStorage.removeItem(MAPPINGS_SESSION_KEY);

  for (const key of Object.values(LIBRARY_SESSION_KEYS)) {
    sessionStorage.removeItem(key);
  }
}
