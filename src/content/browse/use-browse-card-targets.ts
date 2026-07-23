/** Tracks host browse cards and creates light-DOM containers for React portals. */
// src/content/browse/use-browse-card-targets.ts

import { useMemo, useSyncExternalStore } from "react";
import {
	BROWSE_OVERLAY_CONTAINER_CLASS,
	BROWSE_PROCESSED_ATTRIBUTE,
	type BrowseAdapter,
	type HostMediaTarget,
} from "./types";
import { sourceIdentityKey } from "@/mapping/source-identity";

export const BROWSE_MUTATION_OBSERVER_INIT: MutationObserverInit = {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: ["href"],
	characterData: true,
};

export interface BrowseCardTarget {
	key: string;
	parsed: HostMediaTarget;
	container: HTMLElement;
}

interface BrowseCardTargetOptions {
	adapter: BrowseAdapter;
	enabled?: boolean;
}

interface BrowseCardTargetStore {
	getSnapshot: () => BrowseCardTarget[];
	subscribe: (onStoreChange: () => void) => () => void;
}

const cardInstanceIds = new WeakMap<HTMLElement, number>();
let nextCardInstanceId = 1;

function getCardInstanceId(mountTarget: HTMLElement): number {
	const existing = cardInstanceIds.get(mountTarget);
	if (existing !== undefined) return existing;

	const next = nextCardInstanceId;
	nextCardInstanceId += 1;
	cardInstanceIds.set(mountTarget, next);
	return next;
}

function getCardSignature(parsed: HostMediaTarget): string {
	return [
		sourceIdentityKey(parsed.source),
		parsed.format ?? "",
		parsed.title,
		parsed.mountTarget.getAttribute("href") ?? "",
		getCardInstanceId(parsed.mountTarget),
	].join("|");
}

function getObserverRoot(adapter: BrowseAdapter): Node | null {
	return adapter.getObserverRoot?.() ?? document.body ?? document.documentElement;
}

function getScanRoot(adapter: BrowseAdapter): Element | null {
	return (
		adapter.getScanRoot?.() ??
		document.querySelector<HTMLElement>(".page-content") ??
		document.body ??
		null
	);
}

function findPlacementContainer(
	mountTarget: HTMLElement,
): HTMLElement | null {
	for (const child of mountTarget.children) {
		if (
			child instanceof HTMLElement &&
			child.classList.contains(BROWSE_OVERLAY_CONTAINER_CLASS)
		) {
			return child;
		}
	}
	return null;
}

function ensurePlacementContainer(input: {
	parsed: HostMediaTarget;
	adapter: BrowseAdapter;
}): HTMLElement {
	const existing = findPlacementContainer(input.parsed.mountTarget);
	const container =
		existing ?? input.parsed.mountTarget.ownerDocument.createElement("div");

	container.className = BROWSE_OVERLAY_CONTAINER_CLASS;
	container.dataset.corner = input.adapter.anchorCorner ?? "bottom-left";
	container.dataset.presentation =
		input.parsed.presentation ?? "poster-overlay";

	if (!existing) {
		if (input.parsed.presentation === "status-column") {
			input.parsed.mountTarget.prepend(container);
		} else {
			input.parsed.mountTarget.append(container);
		}
	}

	return container;
}

function removeTarget(
	target: BrowseCardTarget,
): void {
	target.parsed.mountTarget.removeAttribute(BROWSE_PROCESSED_ATTRIBUTE);
	target.container.remove();
}

export function cleanupBrowseCardTargets(
	targets: readonly BrowseCardTarget[],
): void {
	for (const target of targets) {
		removeTarget(target);
	}
}

function cleanupMissingTargets(input: {
	previousTargets: readonly BrowseCardTarget[];
	nextTargets: readonly BrowseCardTarget[];
}): void {
	const nextMountTargets = new Set(
		input.nextTargets.map(target => target.parsed.mountTarget),
	);
	for (const target of input.previousTargets) {
		if (!nextMountTargets.has(target.parsed.mountTarget)) {
			removeTarget(target);
		}
	}
}

function targetsEqual(
	a: readonly BrowseCardTarget[],
	b: readonly BrowseCardTarget[],
): boolean {
	if (a.length !== b.length) return false;
	for (const [index, target] of a.entries()) {
		const other = b[index];
		if (
			!other ||
			target.key !== other.key ||
			target.container !== other.container
		) {
			return false;
		}
	}
	return true;
}

export function scanBrowseCardTargets(
	options: BrowseCardTargetOptions,
): BrowseCardTarget[] {
	const root = getScanRoot(options.adapter);
	if (!root) return [];

	const targetsByMountTarget = new Map<HTMLElement, BrowseCardTarget>();
	for (const card of root.querySelectorAll(options.adapter.cardSelector)) {
		const parsed = options.adapter.parseCard(card);
		if (!parsed) {
			continue;
		}
		if (targetsByMountTarget.has(parsed.mountTarget)) {
			continue;
		}

		const container = ensurePlacementContainer({
			parsed,
			adapter: options.adapter,
		});
		parsed.mountTarget.setAttribute(
			BROWSE_PROCESSED_ATTRIBUTE,
			sourceIdentityKey(parsed.source),
		);
		targetsByMountTarget.set(parsed.mountTarget, {
			key: getCardSignature(parsed),
			parsed,
			container,
		});
	}

	return [...targetsByMountTarget.values()];
}

function createBrowseCardTargetStore(
	options: BrowseCardTargetOptions,
): BrowseCardTargetStore {
	let currentTargets: BrowseCardTarget[] = [];

	return {
		getSnapshot: () => currentTargets,
		subscribe: (onStoreChange) => {
			let frameId: number | null = null;
			let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

			const cancelScheduledScan = () => {
				if (frameId !== null) {
					globalThis.cancelAnimationFrame(frameId);
					frameId = null;
				}
				if (timeoutId !== null) {
					globalThis.clearTimeout(timeoutId);
					timeoutId = null;
				}
			};

			const scan = () => {
				frameId = null;
				timeoutId = null;
				const nextTargets = scanBrowseCardTargets(options);
				cleanupMissingTargets({
					previousTargets: currentTargets,
					nextTargets,
				});
				if (targetsEqual(currentTargets, nextTargets)) {
					currentTargets = nextTargets;
					return;
				}

				currentTargets = nextTargets;
				onStoreChange();
			};

			const scheduleScan = () => {
				if (frameId !== null || timeoutId !== null) return;
				if (typeof globalThis.requestAnimationFrame === "function") {
					frameId = globalThis.requestAnimationFrame(scan);
					return;
				}
				timeoutId = globalThis.setTimeout(scan, 0);
			};

			if (options.enabled === false) {
				return () => {};
			}

			const observerRoot = getObserverRoot(options.adapter);
			const observer = observerRoot
				? new MutationObserver(scheduleScan)
				: null;
			observer?.observe(observerRoot as Node, BROWSE_MUTATION_OBSERVER_INIT);
			scan();

			return () => {
				cancelScheduledScan();
				observer?.disconnect();
				cleanupBrowseCardTargets(currentTargets);
				currentTargets = [];
			};
		},
	};
}

export function useBrowseCardTargets(
	adapter: BrowseAdapter,
	enabled: boolean,
): BrowseCardTarget[] {
	const store = useMemo(
		() => createBrowseCardTargetStore({ adapter, enabled }),
		[adapter, enabled],
	);
	return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
