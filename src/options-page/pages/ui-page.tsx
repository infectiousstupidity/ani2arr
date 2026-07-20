/** Options-page controls for browse-card and anime-page UI enablement and visibility settings. */
// src/options-page/pages/ui-page.tsx

import type { ComponentType } from "react";
import { AppWindow, Check, ChevronDown, ExternalLink, Heart, Languages, LayoutGrid, Send } from "lucide-react";
import {
	ANILIST_TITLE_LANGUAGES,
	isAniListTitleLanguage,
	type AniListTitleLanguage,
} from "@/anilist/title";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import type {
	BadgeVisibility,
	BrowseCardPrimaryStatus,
	PublicOptions,
} from "@/settings/types";
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import { Label } from "@/shared/ui/primitives/label";
import { Switch } from "@/shared/ui/primitives/switch";
import { cn } from "@/shared/utils/cn";
import { RadarrIcon, SonarrIcon } from "../components/icons";
import { SettingsSection } from "../components/settings-section";

type BrowseCardMode = BadgeVisibility | "hidden";
type BrowseCardProvider = keyof Omit<
	PublicOptions["ui"]["browseCards"],
	"primaryStatus"
>;
type BrowseCardSettings = PublicOptions["ui"]["browseCards"][BrowseCardProvider];
type AnimePageProvider = keyof PublicOptions["ui"]["animePages"];
type IconComponent = ComponentType<{ className?: string }>;

interface SegmentedButtonOption {
	label: string;
	value: string;
}

interface SegmentedButtonsProps {
	ariaLabel?: string;
	ariaLabelledBy?: string;
	className?: string;
	disabled?: boolean;
	onChange: (value: string) => void;
	options: readonly SegmentedButtonOption[];
	value: string;
}

const BROWSE_CARD_MODE_OPTIONS: readonly {
	label: string;
	value: BrowseCardMode;
}[] = [
	{ label: "Always", value: "always" },
	{ label: "On hover", value: "hover" },
	{ label: "Hidden", value: "hidden" },
];

const BROWSE_CARD_PRIMARY_OPTIONS: readonly {
	label: string;
	value: BrowseCardPrimaryStatus;
}[] = [
	{ label: "Arr", value: "arr" },
	{ label: "Seerr", value: "seerr" },
];

const TITLE_LANGUAGE_LABELS: Record<AniListTitleLanguage, string> = {
	english: "English",
	romaji: "Romaji",
	native: "Native",
};

const TITLE_LANGUAGE_OPTIONS = ANILIST_TITLE_LANGUAGES.map((language) => ({
	label: TITLE_LANGUAGE_LABELS[language],
	value: language,
}));

const UI_PROVIDER_CONTROLS = [
	{ provider: "sonarr", label: "Sonarr", Icon: SonarrIcon },
	{ provider: "radarr", label: "Radarr", Icon: RadarrIcon },
	{ provider: "seerr", label: "Seerr", Icon: Send },
] as const;

const SEGMENTED_ITEM_CLASS =
	"min-h-10 cursor-pointer rounded-sm px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary";

function isBrowseCardMode(mode: string): mode is BrowseCardMode {
	return BROWSE_CARD_MODE_OPTIONS.some((option) => option.value === mode);
}

function getBrowseCardMode(options: BrowseCardSettings): BrowseCardMode {
	return options.enabled ? options.visibility : "hidden";
}

function isBrowseCardPrimaryStatus(
	value: string,
): value is BrowseCardPrimaryStatus {
	return BROWSE_CARD_PRIMARY_OPTIONS.some((option) => option.value === value);
}

function SegmentedButtons(props: SegmentedButtonsProps): React.JSX.Element {
	const {
		ariaLabel,
		ariaLabelledBy,
		className,
		disabled,
		onChange,
		options,
		value,
	} = props;

	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledBy}
			className={cn(
				"grid rounded-md border border-border-primary bg-bg-secondary p-1",
				options.length === 2 ? "grid-cols-2" : "grid-cols-3",
				className,
			)}
		>
			{options.map((option) => {
				const selected = option.value === value;

				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						disabled={disabled}
						className={cn(
							SEGMENTED_ITEM_CLASS,
							selected
								? "bg-accent-primary text-white"
								: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
							disabled && "cursor-not-allowed opacity-60",
						)}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

function BrowseCardModeControl(props: {
	provider: BrowseCardProvider;
	label: string;
	Icon: IconComponent;
	value: BrowseCardMode;
	disabled: boolean;
	onChange: (provider: BrowseCardProvider, mode: string) => void;
}): React.JSX.Element {
	const { provider, label, Icon, value, disabled, onChange } = props;
	const labelId = `ui-browse-${provider}-label`;

	return (
		<div className="flex min-h-30 min-w-0 flex-col justify-center gap-4">
			<div className="flex min-w-0 items-center gap-2.5 text-text-primary">
				<Icon className="h-5 w-5 shrink-0" />
				<Label id={labelId} className="mb-0 inline truncate text-sm font-semibold">
					Show on {label} browse cards?
				</Label>
			</div>
			<SegmentedButtons
				value={value}
				onChange={(mode) => onChange(provider, mode)}
				options={BROWSE_CARD_MODE_OPTIONS}
				ariaLabelledBy={labelId}
				disabled={disabled}
			/>
		</div>
	);
}

function AnimePageSwitch(props: {
	provider: AnimePageProvider;
	label: string;
	Icon: IconComponent;
	checked: boolean;
	disabled: boolean;
	onChange: (provider: AnimePageProvider, enabled: boolean) => void;
}): React.JSX.Element {
	const { provider, label, Icon, checked, disabled, onChange } = props;
	const id = `ui-anime-${provider}`;

	return (
		<div className="flex min-h-23 items-center rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4">
			<div className="flex min-h-11 w-full items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-2.5 text-text-primary">
					<Icon className="h-5 w-5 shrink-0" />
					<Label htmlFor={id} className="mb-0 inline cursor-pointer text-sm font-semibold">
						Show on {label} anime pages
					</Label>
				</div>
				<Switch
					id={id}
					className="shrink-0"
					checked={checked}
					disabled={disabled}
					onCheckedChange={(enabled) => onChange(provider, enabled)}
				/>
			</div>
		</div>
	);
}

export const UiPage = (): React.JSX.Element | null => {
	const { data: publicOptions } = usePublicOptions();
	const saveOptions = useSavePublicOptions();
	const uiOptions = publicOptions?.ui;
	const isSaving = saveOptions.isPending;
	const saveError = saveOptions.error
		? getUserErrorMessage(saveOptions.error, "Failed to save UI settings.")
		: null;

	const updateSettings = (
		updater: (current: PublicOptions) => PublicOptions,
	): void => {
		if (!publicOptions || isSaving) return;
		saveOptions.mutate(updater(publicOptions));
	};

	const updateTitleLanguage = (language: string): void => {
		if (!isAniListTitleLanguage(language)) return;

		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				preferredAniListTitleLanguage: language,
			},
		}));
	};

	const updateBrowsePrimaryStatus = (value: string): void => {
	if (!isBrowseCardPrimaryStatus(value)) return;

	void updateSettings((current) => ({
		...current,
		ui: {
			...current.ui,
			browseCards: {
				...current.ui.browseCards,
				primaryStatus: value,
			},
		},
	}));
};
	const updateBrowseProvider = (
		provider: BrowseCardProvider,
		patch: Partial<BrowseCardSettings>,
	): void => {
		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				browseCards: {
					...current.ui.browseCards,
					[provider]: { ...current.ui.browseCards[provider], ...patch },
				},
			},
		}));
	};

	const updateBrowseProviderMode = (
		provider: BrowseCardProvider,
		mode: string,
	): void => {
		if (!isBrowseCardMode(mode)) return;

		if (mode === "hidden") {
			updateBrowseProvider(provider, { enabled: false });
			return;
		}

		updateBrowseProvider(provider, {
			enabled: true,
			visibility: mode,
		});
	};

	const setAnimePageEnabled = (
		provider: AnimePageProvider,
		enabled: boolean,
	): void => {
		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				animePages: {
					...current.ui.animePages,
					[provider]: { ...current.ui.animePages[provider], enabled },
				},
			},
		}));
	};

	if (!uiOptions) return null;

	return (
		<div className="space-y-10">
			{saveError ? (
				<p className="text-sm font-semibold text-error" role="alert">
					{saveError}
				</p>
			) : null}

			<SettingsSection
				title="AniList display title language"
				description="Choose the AniList title language used in the media modal."
				icon={<Languages className="h-4 w-4" />}
				divider="none"
			>
				<SegmentedButtons
					value={uiOptions.preferredAniListTitleLanguage}
					onChange={updateTitleLanguage}
					options={TITLE_LANGUAGE_OPTIONS}
					ariaLabel="Preferred AniList title language"
					className="w-full max-w-md"
					disabled={isSaving}
				/>
			</SettingsSection>

			<SettingsSection
				title="AniList and AniChart browse cards"
				description="Enable browse and search card injection per provider, choose the primary status, then choose whether enabled cards stay visible or only appear on hover."
				icon={<LayoutGrid className="h-4 w-4" />}
				divider="top"
			>
				<div className="space-y-6">
					<div className="max-w-md space-y-2">
						<Label
							id="ui-browse-primary-status-label"
							className="mb-0 inline text-sm font-semibold text-text-primary"
						>
							Primary browse-card status
						</Label>
						<p className="text-sm text-text-secondary">
							Choose which provider owns the visible browse-card button when both
							Arr and Seerr can handle the title.
						</p>
						<SegmentedButtons
							value={uiOptions.browseCards.primaryStatus}
							onChange={updateBrowsePrimaryStatus}
							options={BROWSE_CARD_PRIMARY_OPTIONS}
							ariaLabelledBy="ui-browse-primary-status-label"
							className="w-full"
							disabled={isSaving}
						/>
					</div>

					<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[auto_repeat(3,minmax(0,1fr))] lg:gap-6">
						<div className="flex h-30 items-start justify-center lg:w-20 lg:justify-start">
							<div
								aria-hidden="true"
								className="relative aspect-2/3 h-full shrink-0 overflow-hidden rounded-md shadow-sm"
							>
								<img
									src="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg"
									alt=""
									draggable={false}
									className="h-full w-full select-none object-cover"
								/>
								<div className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#151f2e] bg-[#43d477]">
									<Check className="h-3.5 w-3.5 stroke-3 text-white" />
								</div>
							</div>
						</div>

						{UI_PROVIDER_CONTROLS.map(({ provider, label, Icon }) => (
							<BrowseCardModeControl
								key={provider}
								provider={provider}
								label={label}
								Icon={Icon}
								value={getBrowseCardMode(uiOptions.browseCards[provider])}
								disabled={isSaving}
								onChange={updateBrowseProviderMode}
							/>
						))}
					</div>
				</div>
			</SettingsSection>

			<SettingsSection
				title="AniList anime pages"
				description="Enable/disable the action bar above AniList's native page buttons for each provider."
				icon={<AppWindow className="h-4 w-4" />}
				divider="top"
			>
				<div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
					<div className="flex min-h-23 items-center justify-center rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4 lg:w-56 lg:justify-start">
						<div
							aria-hidden="true"
							className="flex shrink-0 select-none flex-col gap-2"
						>
							<div className="flex h-8 w-45 gap-1.5">
								<div className="flex flex-1 items-center justify-between rounded bg-[#2b2d42] px-3 shadow-sm">
									<span className="text-[11px] font-semibold text-[#8ba0b2]">
										In Provider
									</span>
									<ChevronDown className="h-3.5 w-3.5 text-white opacity-80" />
								</div>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#3db4f2] shadow-sm">
									<ExternalLink className="h-3.5 w-3.5 text-white opacity-90" />
								</div>
							</div>
							<div className="flex h-8 w-45 gap-1.5 opacity-70">
								<div className="flex flex-1 items-center justify-between rounded bg-[#3db4f2] px-3 shadow-sm">
									<span className="text-[11px] font-semibold text-white">
										Add to List
									</span>
									<ChevronDown className="h-3.5 w-3.5 text-white opacity-80" />
								</div>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#e13357] shadow-sm">
									<Heart className="h-3.5 w-3.5 fill-current text-white" />
								</div>
							</div>
						</div>
					</div>

					{UI_PROVIDER_CONTROLS.map(({ provider, label, Icon }) => (
						<AnimePageSwitch
							key={provider}
							provider={provider}
							label={label}
							Icon={Icon}
							checked={uiOptions.animePages[provider].enabled}
							disabled={isSaving}
							onChange={setAnimePageEnabled}
						/>
					))}
				</div>
			</SettingsSection>
		</div>
	);
};
