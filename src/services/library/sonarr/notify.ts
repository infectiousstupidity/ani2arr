// src/services/library/sonarr/notify.ts
import { logError, normalizeError } from '@/shared/errors/error-utils';
import type { LibraryMutationPayload } from './types';

export type LibraryMutationEmitter = (payload: LibraryMutationPayload) => Promise<void> | void;

export async function notifyLibraryMutation(emit: LibraryMutationEmitter | undefined, payload: LibraryMutationPayload): Promise<void> {
  if (!emit) return;
  try {
    await emit(payload);
  } catch (error) {
    logError(normalizeError(error), 'SonarrLibrary:notifyLibraryMutation');
  }
}
