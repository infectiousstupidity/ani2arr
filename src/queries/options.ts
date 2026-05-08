/** Settings query hooks and cache synchronization owned by the options domain. */
// src/options/queries.ts

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import { queryKeys } from "@/queries/query-keys";
import {
	getExtensionOptionsSnapshot,
	getPublicOptionsSnapshot,
	parseExtensionOptions,
	setExtensionOptionsSnapshot,
	toPublicOptions,
	watchExtensionOptionsSnapshot,
	watchPublicOptionsSnapshot,
} from "../options/store";
import type { ExtensionOptions, PublicOptions } from "../options/types";

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

export const useSaveOptions = () => {
	const queryClient = useQueryClient();

	return useMutation<
		void,
		ExtensionError,
		ExtensionOptions,
		{ previousOptions: ExtensionOptions | undefined }
	>({
		mutationFn: async (options: ExtensionOptions) => {
			try {
				await setExtensionOptionsSnapshot(options);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onMutate: async (newOptions) => {
			await Promise.all([
				queryClient.cancelQueries({ queryKey: queryKeys.options() }),
				queryClient.cancelQueries({ queryKey: queryKeys.publicOptions() }),
			]);
			const previousOptions = queryClient.getQueryData<ExtensionOptions>(
				queryKeys.options(),
			);
			const nextSettings = parseExtensionOptions(newOptions);
			const nextPublicOptions = toPublicOptions(nextSettings);
			queryClient.setQueryData(queryKeys.options(), nextSettings);
			queryClient.setQueryData(queryKeys.publicOptions(), nextPublicOptions);
			return { previousOptions };
		},
		onError: (_err, _newOptions, context) => {
			if (context?.previousOptions) {
				const fallback = parseExtensionOptions(context.previousOptions);
				queryClient.setQueryData(queryKeys.options(), fallback);
				queryClient.setQueryData(
					queryKeys.publicOptions(),
					toPublicOptions(fallback),
				);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.options() });
			queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
		},
	});
};
