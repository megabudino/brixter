/**
 * Controller for `Hero.brix`.
 *
 * `.brix` files are pure markup, so the hero's interactivity lives here. By
 * convention the file name mirrors the brik it enhances: `Hero.brix` ↔
 * `controllers/hero.ts`.
 *
 * It fades each `[data-reveal]` element in once it scrolls into view. It hooks
 * every matching element (not just one), and accumulates a per-instance
 * teardown so repeated client navigations never leave observers behind.
 */
import type { BrixController } from 'brixter/controllers';

export const initHeroReveal: BrixController = (root = document) => {
	const cleanups: Array<() => void> = [];

	root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
		// No IntersectionObserver (older engines, tests): reveal immediately.
		if (typeof IntersectionObserver === 'undefined') {
			el.dataset.revealed = 'true';
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					(entry.target as HTMLElement).dataset.revealed = 'true';
					observer.unobserve(entry.target);
				}
			},
			{ threshold: 0.2 }
		);

		observer.observe(el);
		cleanups.push(() => observer.disconnect());
	});

	return () => cleanups.forEach((fn) => fn());
};
