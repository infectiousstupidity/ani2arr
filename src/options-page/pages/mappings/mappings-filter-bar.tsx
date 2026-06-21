/** Filter controls for the options mapping page list. */
// src/options-page/pages/mappings/mappings-filter-bar.tsx

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import Button from "@/shared/ui/primitives/button";
import { SelectControl } from "@/shared/ui/primitives/select";
import { Input } from "../../components/ui/input";
import type {
	MappingSourceFilter,
	MappingStatusFilter,
	ProviderFilter,
} from "./mapping-page-model";

interface MappingsFilterBarProps {
	provider: ProviderFilter;
	status: MappingStatusFilter;
	source: MappingSourceFilter;
	search: string;
	isRefreshing: boolean;
	onProviderChange: (provider: ProviderFilter) => void;
	onStatusChange: (status: MappingStatusFilter) => void;
	onSourceChange: (source: MappingSourceFilter) => void;
	onSearchChange: (search: string) => void;
	onRefresh: () => void;
}

const PROVIDER_OPTIONS: { label: string; value: ProviderFilter }[] = [
	{ label: "Provider: All", value: "all" },
	{ label: "Sonarr", value: "sonarr" },
	{ label: "Radarr", value: "radarr" },
];

const STATUS_OPTIONS: { label: string; value: MappingStatusFilter }[] = [
	{ label: "Status: All", value: "all" },
	{ label: "Needs review", value: "needs-review" },
	{ label: "In library", value: "in-library" },
	{ label: "Can add", value: "can-add" },
	{ label: "Suppressed", value: "suppressed" },
	{ label: "Unmapped", value: "unmapped" },
	{ label: "Unknown", value: "unknown" },
];

const SOURCE_OPTIONS: { label: string; value: MappingSourceFilter }[] = [
	{ label: "Source: All", value: "all" },
	{ label: "Upstream", value: "upstream" },
	{ label: "Auto", value: "auto" },
	{ label: "Manual", value: "manual" },
];

const isProviderFilter = (value: string): value is ProviderFilter =>
	PROVIDER_OPTIONS.some((option) => option.value === value);

const isStatusFilter = (value: string): value is MappingStatusFilter =>
	STATUS_OPTIONS.some((option) => option.value === value);

const isSourceFilter = (value: string): value is MappingSourceFilter =>
	SOURCE_OPTIONS.some((option) => option.value === value);

export function MappingsFilterBar(
	props: MappingsFilterBarProps,
): React.JSX.Element {
	const {
		provider,
		status,
		source,
		search,
		isRefreshing,
		onProviderChange,
		onStatusChange,
		onSourceChange,
		onSearchChange,
		onRefresh,
	} = props;

	const [localSearch, setLocalSearch] = useState(search);
	const [prevSearchProp, setPrevSearchProp] = useState(search);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	if (search !== prevSearchProp) {
		setPrevSearchProp(search);
		setLocalSearch(search);
	}

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const handleSearchInput = (value: string) => {
		setLocalSearch(value);
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => {
			onSearchChange(value);
		}, 275);
	};

	return (
		<div className="rounded-md border border-border-primary bg-bg-secondary/70 p-4">
			<div className="grid gap-3 md:grid-cols-[160px_180px_160px_minmax(0,1fr)_auto] md:items-center">
				<SelectControl
					value={provider}
					onValueChange={(value) => {
						if (isProviderFilter(value)) {
							onProviderChange(value);
						}
					}}
					options={PROVIDER_OPTIONS}
				/>
				<SelectControl
					value={status}
					onValueChange={(value) => {
						if (isStatusFilter(value)) {
							onStatusChange(value);
						}
					}}
					options={STATUS_OPTIONS}
				/>
				<SelectControl
					value={source}
					onValueChange={(value) => {
						if (isSourceFilter(value)) {
							onSourceChange(value);
						}
					}}
					options={SOURCE_OPTIONS}
				/>
				<div className="relative min-w-0">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
					<Input
						value={localSearch}
						onChange={(event) => handleSearchInput(event.target.value)}
						placeholder="Search titles, AniList IDs, or provider IDs..."
						className="pl-10"
						aria-label="Search mappings"
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={onRefresh}
					disabled={isRefreshing}
					className="shrink-0"
				>
					{isRefreshing ? "Refreshing..." : "Refresh data"}
				</Button>
			</div>
		</div>
	);
}
