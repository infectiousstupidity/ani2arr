/** Provider-library support types owned by the provider domain. */
// src/providers/library/types.ts

import type { ExtensionOptions } from '@/options';
import type { TtlCache } from '@/storage';
import type { RequestPriority } from '@/shared/utils/request-priority';

export interface LibraryStatusOptions {
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
}

export interface ProviderLibraryCaches<TSnapshot> {
  lean: TtlCache<TSnapshot[]>;
}

export type LibraryMutationEmitter<TPayload> = (payload: TPayload) => Promise<void> | void;

export type ProviderCredentialsResolver = (
  options: ExtensionOptions,
) => { url: string; apiKey: string } | null;
