/** Shared explicit-search shell for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-shell.tsx

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { LayoutGroup, LazyMotion, domMax, m } from "framer-motion";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/shared/ui/primitives/button";

type MappingSearchShellProps = {
	providerLabel: string;
	searchPlaceholder: string;
	hasSearchTerm: boolean;
	isFetching: boolean;
	resultCount: number;
	resultImageUrls?: readonly string[] | undefined;
	onQueryChange: () => void;
	onSearch: (term: string) => void;
	children: React.ReactNode;
};

const EMPTY_IMAGE_URLS_KEY = "[]";
const IMAGE_PRELOAD_TIMEOUT_MS = 5000;
const SEARCH_RESULTS_LIST_VARIANTS = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: { staggerChildren: 0.05 },
	},
};

function normalizeImageUrls(urls: readonly string[] | undefined): string[] {
	if (!urls?.length) return [];

	const normalized = new Set<string>();
	for (const url of urls) {
		const trimmed = url.trim();
		if (trimmed) normalized.add(trimmed);
	}

	return [...normalized];
}

function preloadImage(url: string): Promise<void> {
	if (typeof Image === "undefined") return Promise.resolve();

	return new Promise((resolve) => {
		const image = new Image();
		let settled = false;
		const timeout = setTimeout(settle, IMAGE_PRELOAD_TIMEOUT_MS);

		function settle(): void {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			image.removeEventListener("load", handleLoad);
			image.removeEventListener("error", settle);
			resolve();
		}

		function decodeAndSettle(): void {
			const decoded = image.decode?.();
			if (decoded) {
				void decoded.then(settle, settle);
				return;
			}

			settle();
		}

		function handleLoad(): void {
			decodeAndSettle();
		}

		image.addEventListener("load", handleLoad);
		image.addEventListener("error", settle);
		image.decoding = "async";
		image.loading = "eager";
		image.src = url;

		if (image.complete) {
			decodeAndSettle();
		}
	});
}

export function MappingSearchShell(
	props: MappingSearchShellProps,
): React.JSX.Element {
	const {
		providerLabel,
		searchPlaceholder,
		hasSearchTerm,
		isFetching,
		resultCount,
		resultImageUrls,
		onQueryChange,
		onSearch,
		children,
	} = props;
	const [query, setQuery] = useState("");
	const [resultListKey, setResultListKey] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const imageUrlsKey = useMemo(
		() => JSON.stringify(normalizeImageUrls(resultImageUrls)),
		[resultImageUrls],
	);
	const [readyImageUrlsKey, setReadyImageUrlsKey] = useState(
		EMPTY_IMAGE_URLS_KEY,
	);
	const shouldPreloadImages =
		imageUrlsKey !== EMPTY_IMAGE_URLS_KEY && typeof Image !== "undefined";
	const areResultImagesReady =
		!shouldPreloadImages || readyImageUrlsKey === imageUrlsKey;
	const trimmedQuery = query.trim();
	const canSearch = trimmedQuery.length > 0;
	let stateMessage: string | null = null;
	if (isFetching && resultCount === 0) stateMessage = "Searching...";
	else if (hasSearchTerm && resultCount === 0) stateMessage = "No results found.";
	else if (hasSearchTerm && !areResultImagesReady) stateMessage = "Preparing results...";

	useEffect(() => {
		const searchInput = searchInputRef.current;
		if (!searchInput) return;

		if (typeof requestAnimationFrame !== "function") {
			searchInput.focus();
			return;
		}

		const frameId = requestAnimationFrame(() => searchInput.focus());

		return () => cancelAnimationFrame(frameId);
	}, []);

	useEffect(() => {
		if (!shouldPreloadImages) return;

		let cancelled = false;
		const imageUrls = JSON.parse(imageUrlsKey) as string[];

		void Promise.all(imageUrls.map((url) => preloadImage(url))).then(() => {
			if (!cancelled) setReadyImageUrlsKey(imageUrlsKey);
		});

		return () => {
			cancelled = true;
		};
	}, [imageUrlsKey, shouldPreloadImages]);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!canSearch) return;

		onSearch(trimmedQuery);
		setResultListKey((key) => key + 1);
	};

	return (
		<div className="flex h-80 min-h-0 flex-col overflow-hidden pt-4 md:h-full">
			<div className="shrink-0 pb-4">
				<p className="text-sm font-semibold leading-none text-text-primary">
					Search {providerLabel} Database
				</p>

				<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
					<input
						ref={searchInputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							if (hasSearchTerm) onQueryChange();
						}}
						placeholder={searchPlaceholder}
						className="min-w-0 flex-1 rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-primary focus:outline-none"
					/>
					<Button
						type="submit"
						size="sm"
						disabled={!canSearch}
						className="h-9 gap-2 rounded-xl px-3"
					>
						<Search size={15} />
						Search
					</Button>
				</form>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				<LazyMotion features={domMax}>
					<LayoutGroup id="mapping-search-results">
						<ScrollArea.Root className="h-full w-full">
							<ScrollArea.Viewport className="h-full w-full overscroll-contain touch-pan-y scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
								<div className="pb-4 pr-3">
									{stateMessage ? (
										<div className="rounded-xl border border-border-primary/45 bg-bg-secondary/35 px-3 py-6 text-center text-xs text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
											{stateMessage}
										</div>
									) : null}

									{hasSearchTerm && !stateMessage ? (
										<m.div
											key={resultListKey}
											className="flex flex-col gap-2"
											variants={SEARCH_RESULTS_LIST_VARIANTS}
											initial="hidden"
											animate="show"
										>
											{children}
										</m.div>
									) : null}
								</div>
							</ScrollArea.Viewport>

							<ScrollArea.Scrollbar
								orientation="vertical"
								className="flex w-2.5 select-none touch-none p-0.5"
							>
								<ScrollArea.Thumb className="flex-1 rounded bg-border-primary/40" />
							</ScrollArea.Scrollbar>

							<ScrollArea.Corner />
						</ScrollArea.Root>
					</LayoutGroup>
				</LazyMotion>
			</div>
		</div>
	);
}
