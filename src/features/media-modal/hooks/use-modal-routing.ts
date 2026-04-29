/** Owns modal view routing and setup mode selection. */
// src/features/media-modal/hooks/use-modal-routing.ts

import { useState } from "react";

import type {
	MediaModalSetupMode,
	MediaModalView,
	ProviderStatus,
} from "../types";

type ModalRouteInput = {
	isConfigured: boolean;
	providerStatus: ProviderStatus;
	requestedView?: MediaModalView | null;
};

type ModalRoute = {
	view: MediaModalView;
	setupMode: MediaModalSetupMode;
	canShowSetup: boolean;
};

interface UseModalRoutingInput {
	initialView?: MediaModalView | null;
	isConfigured: boolean;
	providerStatus: ProviderStatus;
	setupModeOverride?: MediaModalSetupMode | null;
}

interface ModalRouting extends ModalRoute {
	isMappingView: boolean;
	modeSwitchLabel: string | null;
	handleModeSwitch: (() => void) | null;
	showSetupView: () => void;
}

const hasMappedProviderTarget = (status: ProviderStatus): boolean =>
	status?.providerMappingState === "mapped";

const deriveSetupMode = (status: ProviderStatus): MediaModalSetupMode =>
	status?.isInLibrary === true ? "edit" : "add";

export function deriveModalRoute({
	isConfigured,
	providerStatus,
	requestedView = "setup",
}: ModalRouteInput): ModalRoute {
	const canShowSetup = isConfigured && hasMappedProviderTarget(providerStatus);
	const view =
		requestedView === "mapping" || !canShowSetup ? "mapping" : "setup";

	return {
		view,
		setupMode: deriveSetupMode(providerStatus),
		canShowSetup,
	};
}

function getModeSwitchLabel(input: {
	isMappingView: boolean;
	canShowSetup: boolean;
}): string | null {
	if (!input.isMappingView) {
		return "Change mapping";
	}

	return input.canShowSetup ? "Back to setup" : null;
}

export function useModalRouting({
	initialView,
	isConfigured,
	providerStatus,
	setupModeOverride,
}: UseModalRoutingInput): ModalRouting {
	const [requestedView, setRequestedView] = useState<MediaModalView | null>(
		null,
	);
	const route = deriveModalRoute({
		isConfigured,
		providerStatus,
		requestedView: requestedView ?? initialView ?? "setup",
	});
	const isMappingView = route.view === "mapping";
	const modeSwitchLabel = getModeSwitchLabel({
		isMappingView,
		canShowSetup: route.canShowSetup,
	});

	return {
		...route,
		setupMode: setupModeOverride ?? route.setupMode,
		isMappingView,
		modeSwitchLabel,
		handleModeSwitch: modeSwitchLabel
			? () => setRequestedView(isMappingView ? "setup" : "mapping")
			: null,
		showSetupView: () => setRequestedView("setup"),
	};
}
