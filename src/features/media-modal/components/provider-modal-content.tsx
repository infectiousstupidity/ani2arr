/** Owns shared media modal composition after provider-specific controllers resolve state. */
// src/features/media-modal/components/provider-modal-content.tsx

import type { ComponentProps, ReactNode } from "react";
import type { AniListId } from "@/anilist";
import type { Provider } from "@/providers";
import { DetailsPanel } from "./details/details-panel";
import { Header } from "./header";
import { MappingPanel } from "./mapping/mapping-panel";
import { ProviderModalFooter } from "./provider-modal-footer";
import { ModalBody } from "../modal-body";
import type { MediaModalContainer } from "../types";

type HeaderProps = ComponentProps<typeof Header>;
type MappingPanelProps = ComponentProps<typeof MappingPanel>;
type DetailsPanelProps = ComponentProps<typeof DetailsPanel>;
type FooterProps = ComponentProps<typeof ProviderModalFooter>;

interface ProviderModalContentProps {
	provider: Provider;
	baseUrl: string;
	container?: MediaModalContainer;
	contentContainer: HTMLDivElement | null;
	anilistId: AniListId;
	anilistHeaderData: HeaderProps["anilistHeaderData"];
	effectiveMapping: HeaderProps["effectiveMapping"];
	onClose: () => void;
	onOpenSettings?: HeaderProps["onOpenSettings"];
	modeSwitchLabel?: HeaderProps["modeSwitchLabel"];
	onModeSwitch?: HeaderProps["onModeSwitch"];
	providerActions?: HeaderProps["providerActions"];
	isMappingView: boolean;
	mappingPanelProps: MappingPanelProps;
	setupPane: ReactNode;
	detailsPanelProps: DetailsPanelProps;
	footerProps: FooterProps;
}

export function ProviderModalContent({
	provider,
	baseUrl,
	container,
	contentContainer,
	anilistId,
	anilistHeaderData,
	effectiveMapping,
	onClose,
	onOpenSettings,
	modeSwitchLabel,
	onModeSwitch,
	providerActions,
	isMappingView,
	mappingPanelProps,
	setupPane,
	detailsPanelProps,
	footerProps,
}: ProviderModalContentProps): React.JSX.Element {
	return (
		<ModalBody
			provider={provider}
			baseUrl={baseUrl}
			contentContainer={contentContainer}
			header={
				<Header
					anilistHeaderData={anilistHeaderData}
					anilistId={anilistId}
					effectiveMapping={effectiveMapping}
					onClose={onClose}
					{...(onOpenSettings ? { onOpenSettings } : {})}
					{...(modeSwitchLabel ? { modeSwitchLabel } : {})}
					{...(onModeSwitch ? { onModeSwitch } : {})}
					{...(providerActions ? { providerActions } : {})}
				/>
			}
			leftPane={
				isMappingView ? <MappingPanel {...mappingPanelProps} /> : setupPane
			}
			rightPane={<DetailsPanel {...detailsPanelProps} />}
			footer={<ProviderModalFooter {...footerProps} />}
			onOpenChange={(open) => !open && onClose()}
			{...(container ? { container } : {})}
		/>
	);
}
