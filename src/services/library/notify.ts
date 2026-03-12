import { logError, normalizeError } from '@/shared/errors/error-utils';
import type { LibraryMutationEmitter } from './base-library.interface';

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
