/** Viewport gate used to avoid browse-card status fetches for offscreen cards. */
// src/features/media-overlay/card-overlay-viewport.ts
/* eslint-disable react-hooks/set-state-in-effect -- Viewport gate state follows IntersectionObserver visibility with a short settle delay. */

import { useEffect, useState } from "react";

const callbacks = new WeakMap<Element, (isVisible: boolean) => void>();
let observer: IntersectionObserver | null = null;

function getObserver() {
	if (typeof IntersectionObserver === "undefined") return null;

	if (!observer) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const callback = callbacks.get(entry.target);
					if (callback) {
						callback(entry.isIntersecting && entry.intersectionRatio >= 0.25);
					}
				}
			},
			{ root: null, threshold: 0.25 },
		);
	}

	return observer;
}

export function useCardOverlayInViewport(target?: Element | null): boolean {
	const [isVisible, setIsVisible] = useState(
		() => !target || typeof IntersectionObserver === "undefined",
	);
	const [gateOpen, setGateOpen] = useState(
		() => !target || typeof IntersectionObserver === "undefined",
	);

	useEffect(() => {
		if (!target) return;

		const obs = getObserver();
		if (!obs) {
			return;
		}

		callbacks.set(target, setIsVisible);
		obs.observe(target);

		return () => {
			obs.unobserve(target);
			callbacks.delete(target);
		};
	}, [target]);

	useEffect(() => {
		if (!target || typeof IntersectionObserver === "undefined") {
			setGateOpen(true);
			return;
		}

		if (!isVisible) {
			setGateOpen(false);
			return;
		}

		const timer = globalThis.setTimeout(() => {
			setGateOpen(true);
		}, 125);

		return () => {
			globalThis.clearTimeout(timer);
		};
	}, [isVisible, target]);

	return !target || typeof IntersectionObserver === "undefined"
		? true
		: gateOpen;
}
