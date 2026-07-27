---
name: brixter-controller
description: Add interactivity to a Brixter site by writing a controller — the vanilla JS/TS module in `$lib/brixter/controllers/` that progressively enhances `.brix` markup, its init/cleanup signature, auto-registration, and the `afterNavigate` lifecycle. Use when a brik needs behaviour (animation, toggle, carousel, scroll effect) or when editing a file under a `brixter/controllers/` directory.
---

# Writing a controller

`.brix` files are **pure markup — no `<script>`**. The behaviour that would live
in a Svelte component's `<script>` lives instead in a _controller_: a small
vanilla JS/TS module that progressively enhances the rendered DOM by hooking
onto elements marked with `data-*` attributes.

```
src/lib/brixter/
├── brix/
│   └── Hero.brix          ← pure markup, no <script>
└── controllers/
    └── hero.ts            ← behaviour for Hero.brix
```

By convention **the file name mirrors the brik it enhances** — `Hero.brix` ↔
`controllers/hero.ts`. Nothing enforces it at runtime, so a controller may
enhance elements from any brik; keep the pairing anyway unless the behaviour is
genuinely cross-cutting.

## The signature

Each file exports an **init function** typed `BrixController`:
`(root: ParentNode) => () => void`. It attaches behaviour and returns a
**cleanup**.

```ts
// src/lib/brixter/controllers/hero.ts
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
		cleanups.push(() => observer.disconnect()); // per-instance teardown
	});

	return () => cleanups.forEach((fn) => fn());
};
```

And the markup carries only the hook:

```html
<!-- Hero.brix -->
<section data-reveal>…</section>
```

Three rules are non-negotiable:

1. **Query within `root`, not `document`.** `root` is what scopes a controller
   to a subtree; default the parameter to `document`.
2. **Hook every match, not the first.** Use `querySelectorAll(...).forEach(...)`
   — a controller serves N elements. `querySelector` is almost always a bug.
3. **Return a cleanup that undoes every instance.** Hence the `cleanups` array.
   A controller that only detaches its last element leaks listeners on every
   client navigation. Anything you add — listener, observer, interval,
   animation frame — gets a matching teardown pushed.

## Auto-registration

There is **no registry to maintain**. The Vite plugin collects the folder with
`import.meta.glob('$lib/brixter/controllers/*.{ts,js}', { eager: true })` and
`initBrixControllers` runs every exported init — the default export and any
named export that is a function. **Adding a file registers it; deleting it
unregisters it.**

Consequences worth knowing:

- Every exported function is treated as an init. Don't export helpers from a
  controller module — keep them module-private.
- Execution order is **deterministic**: modules are sorted by path and exports
  by name before running, since `import.meta.glob` guarantees no ordering.
  Don't rely on that order for correctness anyway.
- Errors are **isolated**: a controller that throws is logged with a `[brix]`
  prefix and the rest still run.

## Lifecycle wiring

Controllers touch the DOM, so they run **client-side only**. Run them from the
root `+layout.svelte` on `afterNavigate`, tearing down the previous run
**before** re-attaching:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import { initBrixControllers } from 'brixter/controllers';

	let { children } = $props();
	let teardown: () => void = () => {};

	afterNavigate(async () => {
		teardown();
		await tick(); // let the freshly navigated markup render first
		teardown = initBrixControllers();
	});
</script>

{@render children()}
```

The `teardown()` before and the `await tick()` after are both load-bearing:
without the first, repeated navigations accumulate duplicate listeners; without
the second, the controllers query the previous page's DOM.

`initBrixControllers(root: ParentNode = document)` is **SSR-safe** — with no
`document` it is a no-op returning a no-op cleanup — and returns one combined
cleanup for every controller it ran.

### Owning the glob yourself

For a custom directory, a non-SvelteKit host, or a test, call the runner
directly. `import.meta.glob` must be a literal at your own call site:

```ts
import { runBrixControllers } from 'brixter/controllers';

const modules = import.meta.glob('./controllers/*.{ts,js}', { eager: true });
const teardown = runBrixControllers(modules /*, root */);
```

## Selector style

The default convention gives each controller its own `data-*` hook
(`[data-reveal]`, `[data-tilt]`). If you prefer routing by name in one attribute
— [Stimulus](https://stimulus.hotwired.dev/)-style — match
`[data-controller~="hero"]` instead:

```ts
root.querySelectorAll<HTMLElement>('[data-controller~="hero"]').forEach((el) => {
	/* … */
});
```

```html
<section data-controller="hero">…</section>
```

Purely a selector choice — same folder, same signature, same lifecycle. Pick one
style per project and stay with it.

## Writing behaviour that degrades

The markup renders and the page works before any controller runs — that is the
point of progressive enhancement. So:

- **Never create content from a controller** that the page needs. Content comes
  from the page props through the brik.
- **Feature-detect** anything not universally available (`IntersectionObserver`,
  `matchMedia`, `View Transitions`) and pick a sane no-JS-visible fallback, as
  the example above does.
- **Respect `prefers-reduced-motion`** for any animation.
- The initial state must be **visible**, not hidden-until-enhanced — otherwise a
  failed controller leaves a blank section. Reveal effects belong in CSS keyed
  off an attribute the controller sets (`[data-revealed]`), with the visible
  state as the default.

## Checklist

1. File name mirrors the brik; lives in `$lib/brixter/controllers/`.
2. Exports only init functions typed `BrixController`.
3. Queries `root`, uses `querySelectorAll`, hooks every match.
4. Accumulates a per-instance cleanup and returns them all.
5. Feature-detects; content is never controller-generated.
6. The hook attribute exists in the brik's markup.
