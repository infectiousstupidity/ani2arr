/** Shared anime-page React root for provider actions, metadata, and modal state. */
// src/content/anime-page/root.tsx

import { useState, type ReactElement } from "react";
import { metadataHintFromAniListMetadata } from "@/anilist/title";
import type {
	AniListId,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/types";
import {
	resolveAniListTargetProvider,
	resolveSeerrRequestInput,
} from "@/content/anilist/target-provider";
import type { SourceIdentity } from "@/mapping/source-identity";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { RequestInSeerrInput } from "@/rpc/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import {
	SeerrOpenButton,
	SeerrRequestButton,
} from "@/features/seerr-request/seerr-request-button";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import { MediaModal, type MediaModalMetadataHint } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import type { Provider } from "@/providers/types";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappingIdentities } from "@/queries/mapping";
import { useOptionsQuerySync, usePublicOptions } from "@/queries/options";
import { useSeerrTargets } from "@/queries/seerr";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import type { PublicOptions } from "@/settings/types";
import { ConfirmProvider } from "@/shared/ui/feedback/confirm-provider";
import { useTheme } from "@/shared/hooks/use-theme";
import MediaActions from "@/content/anime-page/media-actions";

export interface AnimePageTarget {
	source: SourceIdentity;
	/** MAL v1 uses source identity internally, but content actions still require an AniList crosswalk. */
	anilistId: AniListId;
	format: AniListMediaFormat | null;
	title: string | null;
}

interface ContentRootProps {
	target: AnimePageTarget;
}

interface AnimeProviderActionProps {
	source: SourceIdentity;
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

interface AnimePageActionStackProps {
	showProviderAction: boolean;
	provider: Provider | null;
	source: SourceIdentity;
	anilistId: AniListId;
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	options: PublicOptions | undefined;
	statusBlocked: boolean;
	portalContainer: HTMLElement | null;
	onOpenSetup(): void;
	onOpenMapping(): void;
	showSeerrAction: boolean;
	seerrRequestInput: RequestInSeerrInput | null;
	onOpenSeerrModal(): void;
}

type AnimePageModalView = "setup" | "mapping";

interface AnimePageOptionsState {
	sonarrEnabled: boolean;
	radarrEnabled: boolean;
	seerrEnabled: boolean;
	actionsEnabled: boolean;
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
	const seerrEnabled = options?.ui?.animePages.seerr.enabled ?? true;

	return {
		sonarrEnabled,
		radarrEnabled,
		seerrEnabled,
		actionsEnabled: sonarrEnabled || radarrEnabled || seerrEnabled,
		hasConfiguredProvider: Boolean(
			(sonarrEnabled && options?.providers.sonarr.isConfigured) ||
				(radarrEnabled && options?.providers.radarr.isConfigured) ||
				(seerrEnabled && options?.seerr.isConfigured),
		),
	};
}

function isProviderConfigured(
	provider: Provider,
	options: PublicOptions | undefined,
): boolean {
	return options?.providers[provider].isConfigured === true;
}

function shouldShowProviderAction(
	provider: Provider | null,
	options: PublicOptions | undefined,
): boolean {
	return provider !== null && isProviderUiEnabled(provider, options);
}

function shouldShowSeerrAction(input: {
	optionState: AnimePageOptionsState;
}): boolean {
	return input.optionState.seerrEnabled;
}

function isMetadataReadyForStatus(input: {
	optionState: AnimePageOptionsState;
	metadataBatch: { isFetched: boolean; isError: boolean };
}): boolean {
	return (
		!input.optionState.hasConfiguredProvider ||
		input.metadataBatch.isFetched ||
		input.metadataBatch.isError
	);
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
	source,
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
		source,
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
	source,
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
		source,
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

function AnimePageActionStack({
	showProviderAction,
	provider,
	source,
	anilistId,
	displayTitle,
	providerTitle,
	metadata,
	isConfigured,
	options,
	statusBlocked,
	portalContainer,
	onOpenSetup,
	onOpenMapping,
	showSeerrAction,
	seerrRequestInput,
	onOpenSeerrModal,
}: AnimePageActionStackProps): ReactElement {
	return (
		<div className="flex w-full flex-col gap-2">
			{showProviderAction && provider === "sonarr" ? (
				<SonarrAnimePageActions
					anilistId={anilistId}
					source={source}
					displayTitle={displayTitle}
					providerTitle={providerTitle}
					metadata={metadata}
					isConfigured={isConfigured}
					defaultForm={options?.providers.sonarr.defaults ?? null}
					statusBlocked={statusBlocked}
					portalContainer={portalContainer}
					onOpenSetup={onOpenSetup}
					onOpenMapping={onOpenMapping}
				/>
			) : null}
			{showProviderAction && provider === "radarr" ? (
				<RadarrAnimePageActions
					anilistId={anilistId}
					source={source}
					displayTitle={displayTitle}
					providerTitle={providerTitle}
					metadata={metadata}
					isConfigured={isConfigured}
					defaultForm={options?.providers.radarr.defaults ?? null}
					statusBlocked={statusBlocked}
					portalContainer={portalContainer}
					onOpenSetup={onOpenSetup}
					onOpenMapping={onOpenMapping}
				/>
			) : null}
			{showSeerrAction ? (
				<div
					className={`grid ${
						options?.seerr.isConfigured === true && seerrRequestInput !== null
							? "grid-cols-[1fr_auto] gap-3.75"
							: "grid-cols-1 gap-0"
					} w-full items-start`}
				>
					<SeerrRequestButton
						requestInput={seerrRequestInput}
						isConfigured={options?.seerr.isConfigured === true}
						portalContainer={portalContainer ?? undefined}
						onOpenModal={onOpenSeerrModal}
					/>
					<SeerrOpenButton
						requestInput={seerrRequestInput}
						isConfigured={options?.seerr.isConfigured === true}
						portalContainer={portalContainer ?? undefined}
					/>
				</div>
			) : null}
		</div>
	);
}

export function ContentRoot({ target }: ContentRootProps): ReactElement | null {
	const { anilistId, source } = target;
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
		enabled: optionState.actionsEnabled,
	});
	const seerrTargets = useSeerrTargets([anilistId], {
		enabled: optionState.seerrEnabled,
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
	const seerrRequestInput = resolveSeerrRequestInput({
		anilistId,
		mappedIdentities: mappingIdentities.data ?? [],
		seerrRequestTarget: seerrTargets.data?.[0] ?? null,
	});
	const showProviderAction = shouldShowProviderAction(provider, options);
	const showSeerrAction = shouldShowSeerrAction({
		optionState,
	});

	if (!showProviderAction && !showSeerrAction) {
		return null;
	}

	const isConfigured = provider ? isProviderConfigured(provider, options) : false;
	const metadataReadyForStatus = isMetadataReadyForStatus({
		optionState,
		metadataBatch,
	});
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
		if (!provider) return;

		mediaModal.open({
			anilistId,
			source,
			kind: "provider",
			provider,
			initialView,
			openSource: "content",
			metadataHint,
		});
	};
	const openSetup = () => openModal("setup");
	const openMapping = () => openModal("mapping");
	const openSeerrModal = () => {
		mediaModal.open({
			anilistId,
			source,
			kind: "seerr",
			openSource: "content",
			metadataHint,
		});
	};

	return (
		<div ref={setHostElement} style={{ width: "100%" }}>
			<ConfirmProvider portalContainer={hostElement ?? null}>
				<AnimePageActionStack
					showProviderAction={showProviderAction}
					provider={provider}
					source={source}
					anilistId={anilistId}
					displayTitle={displayTitle}
					providerTitle={providerTitle}
					metadata={metadata}
					isConfigured={isConfigured}
					options={options}
					statusBlocked={statusBlocked}
					portalContainer={hostElement}
					onOpenSetup={openSetup}
					onOpenMapping={openMapping}
					showSeerrAction={showSeerrAction}
					seerrRequestInput={seerrRequestInput}
					onOpenSeerrModal={openSeerrModal}
				/>
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
