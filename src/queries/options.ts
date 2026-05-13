/** Settings query hooks and cache synchronization owned by the options domain. */
// src/options/queries.ts

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import { queryKeys } from "@/queries/query-keys";
import type { Provider, ProviderCredentials } from "@/providers";
import {
	getPublicOptionsSnapshot,
	getExtensionOptionsSnapshot,
	saveProviderConnectionSnapshot,
	savePublicOptionsSnapshot,
	toPublicOptions,
	watchExtensionOptionsSnapshot,
	watchPublicOptionsSnapshot,
} from "../settings/store";
import type { ExtensionOptions, PublicOptions } from "../settings/types";

const useSyncExtensionOptionsQuery = (
	queryClient: ReturnType<typeof useQueryClient>,
): void => {
	useEffect(() => {
		return watchExtensionOptionsSnapshot((snapshot) => {
			queryClient.setQueryData(queryKeys.options(), snapshot);
		});
	}, [queryClient]);
};

const useSyncPublicOptionsQuery = (
	queryClient: ReturnType<typeof useQueryClient>,
): void => {
	useEffect(() => {
		let active = true;

		const applyPublicOptionsSnapshot = (snapshot: PublicOptions) => {
			if (!active) return;
			queryClient.setQueryData(queryKeys.publicOptions(), snapshot);
			logger.configure({
				enabled: snapshot.debugLogging || import.meta.env.DEV,
			});
		};

		const unsubscribe = watchPublicOptionsSnapshot(applyPublicOptionsSnapshot);

		void getPublicOptionsSnapshot().then(applyPublicOptionsSnapshot);

		return () => {
			active = false;
			unsubscribe();
		};
	}, [queryClient]);
};

export const useExtensionOptions = () => {
	const queryClient = useQueryClient();
	const query = useQuery<ExtensionOptions>({
		queryKey: queryKeys.options(),
		queryFn: () => getExtensionOptionsSnapshot(),
		staleTime: Infinity,
		meta: { persist: false },
	});

	useSyncExtensionOptionsQuery(queryClient);

	return query;
};

export const usePublicOptions = () => {
	const queryClient = useQueryClient();
	const query = useQuery<PublicOptions>({
		queryKey: queryKeys.publicOptions(),
		queryFn: () => getPublicOptionsSnapshot(),
		staleTime: Infinity,
		meta: { persist: false },
	});

	useSyncPublicOptionsQuery(queryClient);

	return query;
};

export const useSavePublicOptions = () => {
	const queryClient = useQueryClient();

	return useMutation<
		{ extensionOptions: ExtensionOptions; publicOptions: PublicOptions },
		ExtensionError,
		PublicOptions
	>({
		mutationFn: async (options: PublicOptions) => {
			try {
				await savePublicOptionsSnapshot(options);
				const [extensionOptions, publicOptions] = await Promise.all([
					getExtensionOptionsSnapshot(),
					getPublicOptionsSnapshot(),
				]);
				return { extensionOptions, publicOptions };
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (saved) => {
			queryClient.setQueryData(queryKeys.options(), saved.extensionOptions);
			queryClient.setQueryData(queryKeys.publicOptions(), saved.publicOptions);
		},
	});
};

export const useSaveProviderConnection = () => {
	const queryClient = useQueryClient();

	return useMutation<
		ExtensionOptions,
		ExtensionError,
		{ provider: Provider; credentials: ProviderCredentials | null }
	>({
		mutationFn: async ({ provider, credentials }) => {
			try {
				return await saveProviderConnectionSnapshot(provider, credentials);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (savedOptions) => {
			queryClient.setQueryData(queryKeys.options(), savedOptions);
			queryClient.setQueryData(
				queryKeys.publicOptions(),
				toPublicOptions(savedOptions),
			);
		},
	});
};
