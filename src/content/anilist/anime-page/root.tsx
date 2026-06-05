/** AniList anime-page React root for provider actions, metadata, and modal state. */
// src/content/anilist/anime-page/root.tsx

import { useState, type ReactElement } from "react";
import { metadataHintFromAniListMetadata } from "@/anilist/title";
import type {
	AniListId,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/types";
import { resolveAniListTargetProvider } from "@/content/anilist/target-provider";
import { openOptionsPage } from "@/rpc/runtime-messages";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import { MediaModal, type MediaModalMetadataHint } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import type { Provider } from "@/providers/types";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappingIdentities } from "@/queries/mapping";
import { useOptionsQuerySync, usePublicOptions } from "@/queries/options";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import type { PublicOptions } from "@/settings/types";
import { ConfirmProvider } from "@/shared/ui/feedback/confirm-provider";
import { useTheme } from "@/shared/hooks/use-theme";
import MediaActions from "./media-actions";

export interface AnimePageTarget {
	anilistId: AniListId;
	format: AniListMediaFormat | null;
	title: string | null;
}

interface ContentRootProps {
	target: AnimePageTarget;
}

interface AnimeProviderActionProps {
	anilistId: AniListId;
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	statusBlocked: boolean;
	portalContainer: HTMLElement | null;
	onOpenSetup(): void;
	onOpenMapping(): void;
}

interface SonarrAnimeActionProps extends AnimeProviderActionProps {
	defaultForm: SonarrFormState | null;
}

interface RadarrAnimeActionProps extends AnimeProviderActionProps {
	defaultForm: RadarrFormState | null;
}

type AnimePageModalView = "setup" | "mapping";

interface AnimePageOptionsState {
	sonarrEnabled: boolean;
	radarrEnabled: boolean;
	hasConfiguredProvider: boolean;
}

function trimToNull(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

function getMetadataTitle(metadata: AniListMediaHint | null): string | null {
	return (
		trimToNull(metadata?.titles?.english) ??
		trimToNull(metadata?.titles?.romaji) ??
		trimToNull(metadata?.titles?.native)
	);
}

function getModalMetadataHint(input: {
	title: string;
	format: AniListMediaFormat | null;
	metadata: AniListMediaHint | null;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.metadata?.format ?? input.format,
		coverImage: input.metadata?.coverImage ?? null,
	};
}

function isProviderUiEnabled(
	provider: Provider,
	options: PublicOptions | undefined,
): boolean {
	return provider === "radarr"
		? (options?.ui?.animePages.radarr.enabled ?? true)
		: (options?.ui?.animePages.sonarr.enabled ?? true);
}

function getAnimePageOptionsState(
	options: PublicOptions | undefined,
): AnimePageOptionsState {
	const sonarrEnabled = options?.ui?.animePages.sonarr.enabled ?? true;
	const radarrEnabled = options?.ui?.animePages.radarr.enabled ?? true;

	return {
		sonarrEnabled,
		radarrEnabled,
		hasConfiguredProvider: Boolean(
			(sonarrEnabled && options?.providers.sonarr.isConfigured) ||
				(radarrEnabled && options?.providers.radarr.isConfigured),
		),
	};
}

function isProviderConfigured(
	provider: Provider,
	options: PublicOptions | undefined,
): boolean {
	return options?.providers[provider].isConfigured === true;
}

function isStatusBlocked(input: {
	optionsPending: boolean;
	isConfigured: boolean;
	metadataReadyForStatus: boolean;
}): boolean {
	return (
		input.optionsPending ||
		(input.isConfigured && !input.metadataReadyForStatus)
	);
}

function SonarrAnimePageActions({
	anilistId,
	displayTitle,
	providerTitle,
	metadata,
	isConfigured,
	defaultForm,
	statusBlocked,
	portalContainer,
	onOpenSetup,
	onOpenMapping,
}: SonarrAnimeActionProps): ReactElement {
	const mediaAction = useSonarrMediaAction({
		anilistId,
		displayTitle,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: true,
		statusBlocked,
		forceVerify: true,
		forceMappingRetry: true,
		onConfigure: () => openOptionsPage({ sectionId: "sonarr" }),
		onOpenMapping,
	});

	return (
		<MediaActions
			provider="sonarr"
			state={mediaAction.status.state}
			errorSource={mediaAction.status.errorSource}
			hasMapping={mediaAction.status.hasMapping}
			disabled={mediaAction.status.disabled}
			openProvider={mediaAction.openProvider}
			onPrimaryAction={mediaAction.runPrimaryAction}
			onOpenSetup={onOpenSetup}
			onOpenMapping={onOpenMapping}
			portalContainer={portalContainer ?? undefined}
		/>
	);
}

function RadarrAnimePageActions({
	anilistId,
	displayTitle,
	providerTitle,
	metadata,
	isConfigured,
	defaultForm,
	statusBlocked,
	portalContainer,
	onOpenSetup,
	onOpenMapping,
}: RadarrAnimeActionProps): ReactElement {
	const mediaAction = useRadarrMediaAction({
		anilistId,
		displayTitle,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: true,
		statusBlocked,
		forceVerify: true,
		forceMappingRetry: true,
		onConfigure: () => openOptionsPage({ sectionId: "radarr" }),
		onOpenMapping,
	});

	return (
		<MediaActions
			provider="radarr"
			state={mediaAction.status.state}
			errorSource={mediaAction.status.errorSource}
			hasMapping={mediaAction.status.hasMapping}
			disabled={mediaAction.status.disabled}
			openProvider={mediaAction.openProvider}
			onPrimaryAction={mediaAction.runPrimaryAction}
			onOpenSetup={onOpenSetup}
			onOpenMapping={onOpenMapping}
			portalContainer={portalContainer ?? undefined}
		/>
	);
}

export function ContentRoot({ target }: ContentRootProps): ReactElement | null {
	const { anilistId } = target;
	const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
	useTheme({ current: hostElement });
	useOptionsQuerySync();
	useA2aBroadcasts();

	const mediaModal = useMediaModalState();
	const publicOptionsQuery = usePublicOptions();
	const options = publicOptionsQuery.data;
	const optionState = getAnimePageOptionsState(options);
	const metadataBatch = useAniListMetadataBatch([anilistId], {
		enabled: optionState.hasConfiguredProvider,
	});
	const mappingIdentities = useMappingIdentities([anilistId], {
		enabled: optionState.sonarrEnabled || optionState.radarrEnabled,
	});
	const metadata = metadataHintFromAniListMetadata(
		metadataBatch.data?.metadata?.[0] ?? null,
	);
	const providerTitle = trimToNull(target.title);
	const displayTitle =
		getMetadataTitle(metadata) ?? providerTitle ?? `AniList #${anilistId}`;
	const provider = resolveAniListTargetProvider({
		anilistId,
		format: target.format,
		mappedIdentities: mappingIdentities.data ?? [],
	});

	if (!provider || !isProviderUiEnabled(provider, options)) {
		return null;
	}

	const isConfigured = isProviderConfigured(provider, options);
	const metadataReadyForStatus =
		!optionState.hasConfiguredProvider ||
		metadataBatch.isFetched ||
		metadataBatch.isError;
	const statusBlocked = isStatusBlocked({
		optionsPending: publicOptionsQuery.isPending,
		isConfigured,
		metadataReadyForStatus,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		format: target.format,
		metadata,
	});
	const openModal = (initialView: AnimePageModalView) => {
		mediaModal.open({
			anilistId,
			provider,
			initialView,
			openSource: "content",
			metadataHint,
		});
	};
	const openSetup = () => openModal("setup");
	const openMapping = () => openModal("mapping");

	return (
		<div ref={setHostElement} style={{ width: "100%" }}>
			<ConfirmProvider portalContainer={hostElement ?? null}>
				{provider === "sonarr" ? (
					<SonarrAnimePageActions
						anilistId={anilistId}
						displayTitle={displayTitle}
						providerTitle={providerTitle}
						metadata={metadata}
						isConfigured={isConfigured}
						defaultForm={options?.providers.sonarr.defaults ?? null}
						statusBlocked={statusBlocked}
						portalContainer={hostElement}
						onOpenSetup={openSetup}
						onOpenMapping={openMapping}
					/>
				) : (
					<RadarrAnimePageActions
						anilistId={anilistId}
						displayTitle={displayTitle}
						providerTitle={providerTitle}
						metadata={metadata}
						isConfigured={isConfigured}
						defaultForm={options?.providers.radarr.defaults ?? null}
						statusBlocked={statusBlocked}
						portalContainer={hostElement}
						onOpenSetup={openSetup}
						onOpenMapping={openMapping}
					/>
				)}
				{hostElement && mediaModal.state ? (
					<MediaModal
						key={`modal-${mediaModal.state.anilistId}`}
						state={mediaModal.state}
						onClose={mediaModal.close}
						container={hostElement}
					/>
				) : null}
			</ConfirmProvider>
		</div>
	);
}
