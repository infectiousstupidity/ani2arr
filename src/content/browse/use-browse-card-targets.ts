/** Tracks host browse cards and creates light-DOM containers for React portals. */
// src/content/browse/use-browse-card-targets.ts

import { useMemo, useSyncExternalStore } from "react";
import {
	BROWSE_CREATED_ATTRIBUTE,
	BROWSE_OVERLAY_CONTAINER_CLASS,
	BROWSE_PROCESSED_ATTRIBUTE,
	type BrowseAdapter,
	type HostMediaTarget,
} from "./types";
import { sourceIdentityKey } from "@/mapping/source-identity";

const BROWSE_MUTATION_OBSERVER_INIT: MutationObserverInit = {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: ["href"],
	characterData: true,
};

const ACTION_ROW_HOST_HEIGHT_PROPERTY = "--a2a-action-row-host-height";

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
	return (
		adapter.getObserverRoot?.() ?? document.body ?? document.documentElement
	);
}

function getScanRoot(adapter: BrowseAdapter): Element | null {
	return (
		adapter.getScanRoot?.() ??
		document.querySelector<HTMLElement>(".page-content") ??
		document.body ??
		null
	);
}

function captureActionRowHostHeight(mountTarget: HTMLElement): void {
	if (
		mountTarget.style.getPropertyValue(ACTION_ROW_HOST_HEIGHT_PROPERTY) !== ""
	) {
		return;
	}

	const view = mountTarget.ownerDocument.defaultView;
	const computedHeight = view?.getComputedStyle(mountTarget).height ?? "";
	const parsedHeight = Number.parseFloat(computedHeight);
	const measuredHeight =
		Number.isFinite(parsedHeight) && parsedHeight > 0
			? parsedHeight
			: mountTarget.getBoundingClientRect().height;

	if (measuredHeight <= 0) return;

	mountTarget.style.setProperty(
		ACTION_ROW_HOST_HEIGHT_PROPERTY,
		`${measuredHeight}px`,
	);
}

function findPlacementContainer(mountTarget: HTMLElement): HTMLElement | null {
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
	if (input.parsed.presentation === "action-row") {
		captureActionRowHostHeight(input.parsed.mountTarget);
	}

	const existing = findPlacementContainer(input.parsed.mountTarget);
	const container =
		existing ?? input.parsed.mountTarget.ownerDocument.createElement("div");
	const corner = input.adapter.anchorCorner ?? "bottom-left";
	const presentation = input.parsed.presentation ?? "poster-overlay";

	// Rescans run often; skip same-value writes so they cause no style work.
	if (container.className !== BROWSE_OVERLAY_CONTAINER_CLASS) {
		container.className = BROWSE_OVERLAY_CONTAINER_CLASS;
	}
	if (container.dataset.corner !== corner) container.dataset.corner = corner;
	if (container.dataset.presentation !== presentation) {
		container.dataset.presentation = presentation;
	}

	if (!existing) {
		if (input.parsed.presentation === "status-column") {
			input.parsed.mountTarget.prepend(container);
		} else {
			input.parsed.mountTarget.append(container);
		}
	}

	return container;
}

function removeTarget(target: BrowseCardTarget): void {
	const removeMountTarget =
		target.parsed.mountTarget.getAttribute(BROWSE_CREATED_ATTRIBUTE) !== null;

	target.parsed.mountTarget.removeAttribute(BROWSE_PROCESSED_ATTRIBUTE);
	target.container.remove();

	if (target.parsed.presentation === "action-row") {
		target.parsed.mountTarget.style.removeProperty(
			ACTION_ROW_HOST_HEIGHT_PROPERTY,
		);
	}

	if (removeMountTarget) target.parsed.mountTarget.remove();
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
		input.nextTargets.map((target) => target.parsed.mountTarget),
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

const ELEMENT_NODE = 1;

function asElement(node: Node | null): Element | null {
	return node?.nodeType === ELEMENT_NODE ? (node as Element) : null;
}

function isOverlayContainer(node: Node): boolean {
	return (
		asElement(node)?.classList.contains(BROWSE_OVERLAY_CONTAINER_CLASS) === true
	);
}

function containsCards(node: Node, cardSelector: string): boolean {
	const element = asElement(node);
	if (!element || isOverlayContainer(element)) return false;
	return (
		element.matches(cardSelector) || element.querySelector(cardSelector) !== null
	);
}

/**
 * Whether a mutation can change the parsed cards. Overlay portal renders, tooltips,
 * and host changes outside cards (feeds, timers) do not, so they skip the rescan.
 */
export function isRelevantBrowseMutation(
	record: MutationRecord,
	cardSelector: string,
): boolean {
	const target = asElement(record.target) ?? record.target.parentElement;
	if (!target) return false;
	if (target.closest(`.${BROWSE_OVERLAY_CONTAINER_CLASS}`)) return false;

	const changedNodes = [...record.addedNodes, ...record.removedNodes];
	if (target.closest(cardSelector)) {
		return (
			record.type !== "childList" ||
			changedNodes.some((node) => !isOverlayContainer(node))
		);
	}

	return (
		record.type === "childList" &&
		changedNodes.some((node) => containsCards(node, cardSelector))
	);
}

export function scanBrowseCardTargets(
	options: BrowseCardTargetOptions,
): BrowseCardTarget[] {
	const root = getScanRoot(options.adapter);
	if (!root) return [];

	const targetsByMountTarget = new Map<HTMLElement, BrowseCardTarget>();

	for (const card of root.querySelectorAll(options.adapter.cardSelector)) {
		const parsed = options.adapter.parseCard(card);
		if (!parsed) continue;

		if (targetsByMountTarget.has(parsed.mountTarget)) {
			continue;
		}

		const container = ensurePlacementContainer({
			parsed,
			adapter: options.adapter,
		});

		const sourceKey = sourceIdentityKey(parsed.source);
		if (parsed.mountTarget.getAttribute(BROWSE_PROCESSED_ATTRIBUTE) !== sourceKey) {
			parsed.mountTarget.setAttribute(BROWSE_PROCESSED_ATTRIBUTE, sourceKey);
		}

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
			const cardSelector = options.adapter.cardSelector;
			const observer = observerRoot
				? new MutationObserver((records) => {
						if (frameId !== null || timeoutId !== null) return;
						if (
							records.some((record) =>
								isRelevantBrowseMutation(record, cardSelector),
							)
						) {
							scheduleScan();
						}
					})
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
