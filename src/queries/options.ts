/** Settings query hooks and root cache synchronization for options values. */
// src/queries/options.ts

import { useEffect } from "react";
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ExtensionError } from "@/shared/errors/error.types";
import { logger } from "@/shared/utils/logger";
import { resetAfterProviderConnectionChange } from "@/queries/invalidation";
import { queryKeys } from "@/queries/query-keys";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { SeerrConnection } from "@/providers/seerr/types";
import { getAni2arrApi } from "@/rpc";
import {
	getPublicOptionsSnapshot,
	getExtensionOptionsSnapshot,
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

function syncOptionsSnapshots(queryClient: QueryClient): void {
	void Promise.all([
		getExtensionOptionsSnapshot(),
		getPublicOptionsSnapshot(),
	]).then(
		([options, publicOptions]) => {
			queryClient.setQueryData(queryKeys.options(), options);
			queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);
		},
		() => {},
	);
}

export const useSavePublicOptions = () => {
	const queryClient = useQueryClient();

	return useMutation<{ ok: true }, ExtensionError, PublicOptions>({
		mutationFn: (options) => getAni2arrApi().savePublicOptions(options),
		onSuccess: () => {
			void getPublicOptionsSnapshot().then(
				(publicOptions) => {
					queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);
				},
				() => {},
			);
		},
	});
};

export const useSaveProviderConnection = () => {
	const queryClient = useQueryClient();

	return useMutation<
		{ ok: true },
		ExtensionError,
		{ provider: Provider; credentials: ProviderCredentials | null }
	>({
		mutationFn: (input) => getAni2arrApi().saveProviderConnection(input),
		onSuccess: (_, { provider }) => {
			resetAfterProviderConnectionChange(queryClient, provider);
			syncOptionsSnapshots(queryClient);
		},
	});
};

export const useSaveSeerrConnection = () => {
	const queryClient = useQueryClient();

	return useMutation<
		{ ok: true },
		ExtensionError,
		{ connection: SeerrConnection | null }
	>({
		mutationFn: (input) => getAni2arrApi().saveSeerrConnection(input),
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
			syncOptionsSnapshots(queryClient);
		},
	});
};
