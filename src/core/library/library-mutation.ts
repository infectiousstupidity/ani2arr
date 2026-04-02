import { logError, normalizeError } from '@/shared/errors';
import type { LibraryMutationEmitter } from './library.types';

export async function notifyLibraryMutation<TPayload>(
  scope: string,
  emit: LibraryMutationEmitter<TPayload> | undefined,
  payload: TPayload,
): Promise<void> {
  if (!emit) return;

  try {
    await emit(payload);
  } catch (error) {
    logError(normalizeError(error), scope);
  }
}
