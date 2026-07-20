/** Settings query hooks and root cache synchronization for options values. */
// src/queries/options.ts

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeError } from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import { logger } from "@/shared/utils/logger";
import { queryKeys } from "@/queries/query-keys";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { SeerrConnection } from "@/providers/seerr/types";
import {
	getPublicOptionsSnapshot,
	getExtensionOptionsSnapshot,
	saveProviderConnectionSnapshot,
	saveSeerrConnectionSnapshot,
	savePublicOptionsSnapshot,
	watchExtensionOptionsSnapshot,
	watchPublicOptionsSnapshot,
} from "../settings/store";
import type { ExtensionOptions, PublicOptions } from "../settings/types";

export function useOptionsQuerySync(): void {
	usePublicOptionsQuerySync();

	const queryClient = useQueryClient();

	useEffect(() => {
		let active = true;

		const applyExtensionOptionsSnapshot = (snapshot: ExtensionOptions) => {
			if (!active) return;
			queryClient.setQueryData(queryKeys.options(), snapshot);
		};

		const unsubscribeExtension = watchExtensionOptionsSnapshot(
			applyExtensionOptionsSnapshot,
		);

		void queryClient
			.ensureQueryData({
				queryKey: queryKeys.options(),
				queryFn: () => getExtensionOptionsSnapshot(),
				staleTime: Infinity,
			})
			.then(applyExtensionOptionsSnapshot, () => {});
		return () => {
			active = false;
			unsubscribeExtension();
		};
	}, [queryClient]);
}

export function usePublicOptionsQuerySync(): void {
	const queryClient = useQueryClient();

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

		void queryClient
			.ensureQueryData({
				queryKey: queryKeys.publicOptions(),
				queryFn: () => getPublicOptionsSnapshot(),
				staleTime: Infinity,
			})
			.then(applyPublicOptionsSnapshot, () => {});

		return () => {
			active = false;
			unsubscribe();
		};
	}, [queryClient]);
}

export const useExtensionOptions = () =>
	useQuery<ExtensionOptions>({
		queryKey: queryKeys.options(),
		queryFn: () => getExtensionOptionsSnapshot(),
		staleTime: Infinity,
	});

export const usePublicOptions = () =>
	useQuery<PublicOptions>({
		queryKey: queryKeys.publicOptions(),
		queryFn: () => getPublicOptionsSnapshot(),
		staleTime: Infinity,
	});

export const useSavePublicOptions = () => {
	const queryClient = useQueryClient();

	return useMutation<
		PublicOptions,
		ExtensionError,
		PublicOptions
	>({
		mutationFn: async (options: PublicOptions) => {
			try {
				await savePublicOptionsSnapshot(options);
				return await getPublicOptionsSnapshot();
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (publicOptions) => {
			queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);
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
		onSuccess: async (savedOptions) => {
			queryClient.setQueryData(queryKeys.options(), savedOptions);
			queryClient.setQueryData(
				queryKeys.publicOptions(),
				await getPublicOptionsSnapshot(),
			);
		},
	});
};

export const useSaveSeerrConnection = () => {
	const queryClient = useQueryClient();

	return useMutation<
		ExtensionOptions,
		ExtensionError,
		{ connection: SeerrConnection | null }
	>({
		mutationFn: async ({ connection }) => {
			try {
				return await saveSeerrConnectionSnapshot(connection);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: async (savedOptions) => {
			queryClient.setQueryData(queryKeys.options(), savedOptions);
			queryClient.setQueryData(
				queryKeys.publicOptions(),
				await getPublicOptionsSnapshot(),
			);
		},
	});
};
