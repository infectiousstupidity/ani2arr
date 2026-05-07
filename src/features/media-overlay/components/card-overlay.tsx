/** AniList card overlay actions for quick add, mapping fixes, and provider links. */
// src/features/media-overlay/components/card-overlay.tsx
/* eslint-disable react-hooks/set-state-in-effect -- Existing visibility gate resets local overlay state when the card closes. */

import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Check,
	TriangleAlert,
	SlidersHorizontal,
	Plus,
	Wrench,
	SquareArrowOutUpRight,
	RotateCcw,
} from "lucide-react";
import type { AniListId } from "@/anilist";
import type { MediaModalLaunchSnapshot } from "@/features/media-modal/launch-snapshot";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import type { BadgeVisibility } from "@/options/types";
import type { Provider } from "@/providers";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import { getProviderLabel } from "@/providers/provider-labels";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import { useCardOverlayState } from "../hooks/use-card-overlay-state";
import {
	buildProviderActionModel,
	type ProviderActionState,
} from "@/features/provider-action";

interface CardOverlayProps {
	provider: Provider;
	anilistId: AniListId;
	title: string;
	onOpenModal: (snapshot: MediaModalLaunchSnapshot) => void;
	onOpenMapping?: (snapshot: MediaModalLaunchSnapshot) => void;
	isConfigured: boolean;
	defaultForm: SonarrFormState | RadarrFormState | null;
	mappedIdentity?: EffectiveMappingPresence | null;
	metadata: AniListMediaHint | null;
	providerUrl: string | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	anchorCorner?: "bottom-left" | "top-left";
	stackDirection?: "up" | "down";
	anchorOffsetX?: number;
}

function getPrimaryActionIcon(actionState: ProviderActionState) {
	switch (actionState) {
		case "checking":
		case "adding": {
			return (
				<RotateCcw
					className="a2a-card-overlay__symbol a2a-rotate"
					aria-hidden="true"
				/>
			);
		}
		case "in-library": {
			return <Check className="a2a-card-overlay__symbol" aria-hidden="true" />;
		}
		case "unmapped": {
			return <Wrench className="a2a-card-overlay__symbol" aria-hidden="true" />;
		}
		case "unknown":
		case "error": {
			return (
				<TriangleAlert
					className="a2a-card-overlay__symbol"
					aria-hidden="true"
				/>
			);
		}
		default: {
			return <Plus className="a2a-card-overlay__symbol" aria-hidden="true" />;
		}
	}
}

function useOverlayVisibilityGate(observeTarget?: Element | null) {
	const [isVisible, setIsVisible] = useState(false);
	const [gateOpen, setGateOpen] = useState(false);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const gateTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
		null,
	);

	useEffect(() => {
		const target = (observeTarget as Element | undefined) ?? null;
		if (!target || typeof IntersectionObserver === "undefined") {
			return;
		}

		if (!observerRef.current) {
			observerRef.current = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.target === target) {
							setIsVisible(
								entry.isIntersecting && entry.intersectionRatio >= 0.25,
							);
						}
					}
				},
				{ root: null, threshold: 0.25 },
			);
		}

		const observer = observerRef.current;

		try {
			observer.observe(target);
		} catch {
			// ignore
		}

		return () => {
			try {
				observer.unobserve(target);
			} catch {
				// ignore
			}
		};
	}, [observeTarget]);

	useEffect(() => {
		if (!isVisible) {
			setGateOpen(false);

			if (gateTimerRef.current !== null) {
				globalThis.clearTimeout(gateTimerRef.current);
				gateTimerRef.current = null;
			}

			return;
		}

		if (gateTimerRef.current !== null) {
			globalThis.clearTimeout(gateTimerRef.current);
			gateTimerRef.current = null;
		}

		gateTimerRef.current = globalThis.setTimeout(() => {
			setGateOpen(true);
			gateTimerRef.current = null;
		}, 125);

		return () => {
			if (gateTimerRef.current !== null) {
				globalThis.clearTimeout(gateTimerRef.current);
				gateTimerRef.current = null;
			}
		};
	}, [isVisible]);

	return { isVisible, gateOpen };
}

const CardOverlay: React.FC<CardOverlayProps> = memo(
	({
		provider,
		anilistId,
		title,
		onOpenModal,
		onOpenMapping,
		isConfigured,
		defaultForm,
		mappedIdentity = null,
		metadata,
		providerUrl,
		observeTarget,
		badgeVisibility = "always",
		anchorCorner = "bottom-left",
		stackDirection = "up",
		anchorOffsetX = -8,
	}) => {
		const { isVisible, gateOpen } = useOverlayVisibilityGate(observeTarget);
		const [stackOpen, setStackOpen] = useState(false);
		const closeTimerRef = useRef<ReturnType<
			typeof globalThis.setTimeout
		> | null>(null);

		const openStack = useCallback(() => {
			if (closeTimerRef.current !== null) {
				globalThis.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
			setStackOpen(true);
		}, []);

		const scheduleCloseStack = useCallback(() => {
			if (closeTimerRef.current !== null) {
				globalThis.clearTimeout(closeTimerRef.current);
			}
			closeTimerRef.current = globalThis.setTimeout(() => {
				setStackOpen(false);
				closeTimerRef.current = null;
			}, 160);
		}, []);

		const {
			actionSummary,
			primaryTitle,
			primaryAriaLabel,
			handlePrimaryAction,
			providerRouteSlug,
			resolvedSearchTerm,
			launchSnapshot,
		} = useCardOverlayState({
			provider,
			anilistId,
			title,
			metadata,
			defaultForm,
			isConfigured,
			mappedIdentity,
			enabled: isVisible && gateOpen,
			...(onOpenMapping ? { onOpenMapping } : {}),
		});

		const providerLabel = getProviderLabel(provider);
		const primaryActionIcon = getPrimaryActionIcon(actionSummary.state);
		const externalHref = useMemo(() => {
			return buildProviderOpenUrl({
				provider,
				baseUrl: providerUrl ?? "",
				isInLibrary:
					actionSummary.state === "in-library" && Boolean(providerRouteSlug),
				...(providerRouteSlug ? { providerRouteSlug } : {}),
				searchTerm: resolvedSearchTerm,
			});
		}, [
			actionSummary.state,
			provider,
			providerRouteSlug,
			providerUrl,
			resolvedSearchTerm,
		]);
		const actionModel = useMemo(
			() =>
				buildProviderActionModel({
					summary: actionSummary,
					hasExternalHref: Boolean(externalHref),
					canQuickAdd: defaultForm !== null,
				}),
			[actionSummary, defaultForm, externalHref],
		);

		const swallowEvent = useCallback((event: React.MouseEvent<HTMLElement>) => {
			event.preventDefault();
			event.stopPropagation();
		}, []);

		const handleOpenSetup = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				swallowEvent(event);
				onOpenModal(launchSnapshot);
			},
			[launchSnapshot, onOpenModal, swallowEvent],
		);

		const tooltipContainer = useMemo(
			() => (typeof document === "undefined" ? null : document.body),
			[],
		);

		const manualMappingLabel = actionModel.hasMapping
			? "Update mapping manually"
			: "Find match manually";

		const actionOpenExternal =
			actionModel.showExternalAction && externalHref ? (
				<TooltipWrapper
					content={`Open in ${providerLabel}`}
					side="right"
					align="center"
					sideOffset={6}
					container={tooltipContainer}
					showArrow={false}
				>
					<button
						type="button"
						className="a2a-card-overlay__action a2a-card-overlay__action--external"
						aria-label={`Open in ${providerLabel}`}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();

							try {
								window.open(externalHref, "_blank", "noopener");
							} catch {
								// ignore
							}
						}}
						onMouseDown={swallowEvent}
					>
						<SquareArrowOutUpRight aria-hidden="true" className="h-4 w-4" />
					</button>
				</TooltipWrapper>
			) : null;

		const actionFixMapping =
			onOpenMapping && actionModel.showMappingAction ? (
				<TooltipWrapper
					content={manualMappingLabel}
					side="right"
					align="center"
					sideOffset={6}
					container={tooltipContainer}
					showArrow={false}
				>
					<button
						type="button"
						className="a2a-card-overlay__action a2a-card-overlay__action--fix"
						aria-label={manualMappingLabel}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							onOpenMapping(launchSnapshot);
						}}
						onMouseDown={swallowEvent}
					>
						<Wrench aria-hidden="true" className="h-4 w-4" />
					</button>
				</TooltipWrapper>
			) : null;

		const actionSetup = actionModel.showSetupAction ? (
			<TooltipWrapper
				content={`${providerLabel} options`}
				side="right"
				align="center"
				sideOffset={6}
				container={tooltipContainer}
				showArrow={false}
			>
				<button
					type="button"
					className="a2a-card-overlay__action a2a-card-overlay__action--advanced"
					aria-label={`Open ${providerLabel} options`}
					onClick={handleOpenSetup}
					onMouseDown={swallowEvent}
				>
					<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
				</button>
			</TooltipWrapper>
		) : null;

		const renderStackItems = () => {
			const items: React.ReactElement[] = [];

			if (stackDirection === "down") {
				if (actionSetup) {
					items.push(<span key="setup">{actionSetup}</span>);
				}
				if (actionFixMapping) {
					items.push(<span key="fix">{actionFixMapping}</span>);
				}
				if (actionOpenExternal) {
					items.push(<span key="external">{actionOpenExternal}</span>);
				}
			} else {
				if (actionOpenExternal) {
					items.push(<span key="external">{actionOpenExternal}</span>);
				}
				if (actionFixMapping) {
					items.push(<span key="fix">{actionFixMapping}</span>);
				}
				if (actionSetup) {
					items.push(<span key="setup">{actionSetup}</span>);
				}
			}

			return items;
		};

		return (
			<div
				className="a2a-card-overlay"
				data-state={actionSummary.state}
				data-corner={anchorCorner}
				data-visibility={badgeVisibility}
				style={
					{ ["--badge-offset-x"]: `${anchorOffsetX}px` } as React.CSSProperties
				}
				onMouseEnter={openStack}
				onMouseLeave={scheduleCloseStack}
			>
				<div
					className="a2a-card-overlay__anchor-wrap"
					onMouseEnter={openStack}
					onMouseLeave={scheduleCloseStack}
				>
					<TooltipWrapper
						content={primaryTitle}
						side="right"
						align="center"
						sideOffset={6}
						container={tooltipContainer}
						showArrow={false}
					>
						<button
							type="button"
							className="a2a-card-overlay__quick"
							data-state={actionSummary.state}
							aria-label={primaryAriaLabel}
							onClick={handlePrimaryAction}
							onMouseDown={swallowEvent}
							disabled={actionModel.disablePrimaryAction}
							aria-disabled={actionModel.disablePrimaryAction || undefined}
						>
							{primaryActionIcon}
						</button>
					</TooltipWrapper>
				</div>

				{actionSetup || actionOpenExternal || actionFixMapping ? (
					<div
						className="a2a-card-overlay__stack"
						data-open={stackOpen || undefined}
						data-direction={stackDirection}
						onMouseEnter={openStack}
						onMouseLeave={scheduleCloseStack}
					>
						{renderStackItems()}
					</div>
				) : null}
			</div>
		);
	},
);

CardOverlay.displayName = "CardOverlay";

export { CardOverlay };
