import { scheduleLibraryRefresh } from "@/background/api-services";
import type { Provider } from "@/providers/types";
import { bumpProviderLibraryRevision } from "@/rpc/revision-signals";
import { ErrorCode } from "@/shared/errors/error.types";
import { createError, logError, normalizeError } from "@/shared/errors/error-utils";

export async function maintainArrMutationCache(
	provider: Provider,
	upsert: () => Promise<boolean>,
): Promise<void> {
	try {
		if (await upsert()) await bumpProviderLibraryRevision(provider);
	} catch (error) {
		const normalized = normalizeError(error);
		// Storage errors can contain credentials in their messages or details.
		logError(
			createError(
				Object.values(ErrorCode).includes(normalized.code)
					? normalized.code
					: ErrorCode.UNKNOWN_ERROR,
				"Local library cache maintenance failed after a successful mutation.",
				"Local library cache maintenance failed.",
			),
			`Arr mutation:${provider}`,
		);
	} finally {
		scheduleLibraryRefresh(provider);
	}
}
