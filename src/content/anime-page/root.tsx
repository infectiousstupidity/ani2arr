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
	resolveProviderForAniListFormat,
} from "@/content/target-provider";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { MappingIdentity, RequestInSeerrInput } from "@/rpc/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import {
	SeerrOpenButton,
	SeerrRequestButton,
} from "@/features/seerr-request/seerr-request-button";
import { toSeerrRequestInput } from "@/features/seerr-request/seerr-request-input";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import { MediaModal } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import type { MediaModalMetadataHint } from "@/features/media-modal/types";
import type { Provider } from "@/providers/types";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappingIdentities, useSourceAniListIdMap } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import { useSeerrTarget } from "@/queries/seerr";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import type { PublicOptions } from "@/settings/types";
import { ConfirmProvider } from "@/shared/ui/feedback/confirm-provider";
import { useTheme } from "@/shared/hooks/use-theme";
import MediaActions from "@/content/anime-page/media-actions";

export interface AnimePageTarget {
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
	format: AniListMediaFormat | null;
	title: string | null;
	metadata?: AniListMediaHint | null | undefined;
}

interface ContentRootProps {
	target: AnimePageTarget;
	compactActions?: boolean;
}

interface AnimeProviderActionProps {
	compact: boolean;
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
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
	compact: boolean;
	showProviderAction: boolean;
	provider: Provider | null;
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
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

function isSeerrTargetQueryEnabled(
	optionState: AnimePageOptionsState,
	options: PublicOptions | undefined,
): boolean {
	return optionState.seerrEnabled && options?.seerr.isConfigured === true;
}

function getResolvedAniListId(
	target: AnimePageTarget,
	idsBySource: Record<string, AniListId | null> | undefined,
): AniListId | undefined {
	if (target.anilistId !== undefined) return target.anilistId;
	return idsBySource?.[sourceIdentityKey(target.source)] ?? undefined;
}

function toAniListIdBatch(anilistId: AniListId | undefined): AniListId[] {
	return anilistId === undefined ? [] : [anilistId];
}

function getTargetProvider(input: {
	anilistId: AniListId | undefined;
	format: AniListMediaFormat | null;
	mappedIdentities: readonly MappingIdentity[];
}): Provider | null {
	if (input.anilistId === undefined) {
		return resolveProviderForAniListFormat(input.format);
	}

	return resolveAniListTargetProvider({
		anilistId: input.anilistId,
		format: input.format,
		mappedIdentities: input.mappedIdentities,
	});
}

function getFallbackTitle(source: SourceIdentity): string {
	return `${source.source === "mal" ? "MAL" : "AniList"} #${source.id}`;
}

function isMetadataReadyForStatus(input: {
	hasAniListId: boolean;
	optionState: AnimePageOptionsState;
	metadataBatch: { isFetched: boolean; isError: boolean };
}): boolean {
	return (
		!input.hasAniListId ||
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
	compact,
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
		...(anilistId === undefined ? {} : { anilistId }),
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
			compact={compact}
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
	compact,
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
		...(anilistId === undefined ? {} : { anilistId }),
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
			compact={compact}
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
	compact,
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
		<div className={`flex w-full flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
			{showProviderAction && provider === "sonarr" ? (
				<SonarrAnimePageActions
					compact={compact}
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
					compact={compact}
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
							? `grid-cols-[1fr_auto] ${compact ? "gap-2" : "gap-3.75"}`
							: "grid-cols-1 gap-0"
					} w-full items-start`}
				>
					<SeerrRequestButton
						requestInput={seerrRequestInput}
						isConfigured={options?.seerr.isConfigured === true}
						compact={compact}
						portalContainer={portalContainer ?? undefined}
						onOpenModal={onOpenSeerrModal}
					/>
					<SeerrOpenButton
						requestInput={seerrRequestInput}
						isConfigured={options?.seerr.isConfigured === true}
						compact={compact}
						portalContainer={portalContainer ?? undefined}
					/>
				</div>
			) : null}
		</div>
	);
}

export function ContentRoot({
	target,
	compactActions = false,
}: ContentRootProps): ReactElement | null {
	const { source } = target;
	const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
	useTheme({ current: hostElement });
	useA2aBroadcasts();

	const mediaModal = useMediaModalState();
	const publicOptionsQuery = usePublicOptions();
	const options = publicOptionsQuery.data;
	const optionState = getAnimePageOptionsState(options);
	const sourceAniListIds = useSourceAniListIdMap([source], {
		enabled: target.anilistId === undefined,
	});
	const anilistId = getResolvedAniListId(target, sourceAniListIds.data);
	const anilistIds = toAniListIdBatch(anilistId);
	const metadataBatch = useAniListMetadataBatch(anilistIds, {
		enabled: optionState.hasConfiguredProvider,
	});
	const mappingIdentities = useMappingIdentities(anilistIds, {
		enabled: optionState.actionsEnabled,
	});
	const seerrTargetInput = {
		source,
		...(anilistId === undefined ? {} : { anilistId }),
		...(target.title === null ? {} : { title: target.title }),
		metadata: target.metadata ?? null,
	};
	const seerrTarget = useSeerrTarget(seerrTargetInput, {
		enabled: isSeerrTargetQueryEnabled(optionState, options),
	});
	const canonicalMetadata = metadataHintFromAniListMetadata(
		metadataBatch.data?.metadata?.[0] ?? null,
	);
	const metadata = canonicalMetadata ?? target.metadata ?? null;
	const providerTitle = trimToNull(target.title);
	const displayTitle =
		getMetadataTitle(metadata) ?? providerTitle ?? getFallbackTitle(source);
	const provider = getTargetProvider({
		anilistId,
		format: target.format,
		mappedIdentities: mappingIdentities.data ?? [],
	});
	const seerrRequestInput = toSeerrRequestInput(seerrTarget.data ?? null);
	const showProviderAction = shouldShowProviderAction(provider, options);
	const showSeerrAction = shouldShowSeerrAction({
		optionState,
	});

	if (!showProviderAction && !showSeerrAction) {
		return null;
	}

	const isConfigured = provider
		? isProviderConfigured(provider, options)
		: false;
	const metadataReadyForStatus = isMetadataReadyForStatus({
		hasAniListId: anilistId !== undefined,
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
			...(anilistId === undefined ? {} : { anilistId }),
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
			...(anilistId === undefined ? {} : { anilistId }),
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
					compact={compactActions}
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
						key={`modal-${sourceIdentityKey(source)}`}
						state={mediaModal.state}
						onClose={mediaModal.close}
						container={hostElement}
					/>
				) : null}
			</ConfirmProvider>
		</div>
	);
}
