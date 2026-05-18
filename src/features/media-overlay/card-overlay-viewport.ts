/** Viewport gate used to avoid browse-card status fetches for offscreen cards. */
// src/features/media-overlay/card-overlay-viewport.ts

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
	const [visibleTarget, setVisibleTarget] = useState<Element | null>(null);
	const [openTarget, setOpenTarget] = useState<Element | null>(null);

	useEffect(() => {
		if (!target) return;

		const obs = getObserver();
		if (!obs) {
			return;
		}

		callbacks.set(target, (isVisible) => {
			setVisibleTarget(isVisible ? target : null);
			if (!isVisible) {
				setOpenTarget(null);
			}
		});
		obs.observe(target);

		return () => {
			obs.unobserve(target);
			callbacks.delete(target);
		};
	}, [target]);

	useEffect(() => {
		if (visibleTarget === null) return;

		const timer = globalThis.setTimeout(() => {
			setOpenTarget(visibleTarget);
		}, 125);

		return () => {
			globalThis.clearTimeout(timer);
		};
	}, [visibleTarget]);

	return !target || typeof IntersectionObserver === "undefined"
		? true
		: visibleTarget === target && openTarget === target;
}
