// src/features/media-overlay/card-overlay-viewport.ts

import { useEffect, useState } from "react";

const callbacks = new WeakMap<Element, Set<(isVisible: boolean) => void>>();
let observer: IntersectionObserver | null = null;

function getObserver() {
	if (typeof IntersectionObserver === "undefined") return null;

	if (!observer) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const elementCallbacks = callbacks.get(entry.target);
					if (elementCallbacks) {
						for (const callback of elementCallbacks) {
							callback(entry.isIntersecting && entry.intersectionRatio >= 0.25);
						}
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

		const callback = (isVisible: boolean) => {
			setVisibleTarget(isVisible ? target : null);
			if (!isVisible) {
				setOpenTarget(null);
			}
		};

		let elementCallbacks = callbacks.get(target);
		if (!elementCallbacks) {
			elementCallbacks = new Set();
			callbacks.set(target, elementCallbacks);
		}
		elementCallbacks.add(callback);

		obs.observe(target);

		return () => {
			const currentCallbacks = callbacks.get(target);
			if (currentCallbacks) {
				currentCallbacks.delete(callback);
				if (currentCallbacks.size === 0) {
					obs.unobserve(target);
					callbacks.delete(target);
				}
			}
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
