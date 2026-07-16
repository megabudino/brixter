# brixter

The SvelteKit integration for [Brixter](../../README.md). It compiles declarative `.brix.yaml` pages into Svelte components, renders reusable content blocks (_briks_), and wires SEO metadata into `<head>` — so your marketing content stays as versioned files in your repo.

> Prefer the big picture first? Start with the [project README](../../README.md).

## What's in this package

| Import                | What it is                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `brixter/vite`        | The Vite plugin that compiles `.brix.yaml` / `.brix.yml` pages.                                 |
| `brixter/seo`         | `<BrixSeo>`, the component that renders SEO metadata into `<head>`.                             |
| `brixter/controllers` | `initBrixControllers` + the `BrixController` type — progressive enhancement for `.brix` markup. |
| `brixter`             | Theming primitives: `<ThemeController>` and the `themePreference` store helpers.                |
| `brixter/styles.css`  | Base stylesheet shared by briks.                                                                |

## Install

```sh
npm install brixter
```

You'll also need `@brixter/core` (installed as a dependency of `brixter`) — it provides the framework-agnostic render engine used at runtime.

## Configure

### 1. Register the page extensions

In `svelte.config.js`, tell SvelteKit to treat `.brix.yaml` / `.brix.yml` as routable page files:

```js
const config = {
	extensions: ['.svelte', '.brix.yaml', '.brix.yml'],
	preprocess: [vitePreprocess()]
};
```

### 2. Add the Vite plugin

In `vite.config.ts`, add `brixter()` **before** `sveltekit()`, and keep the package bundled for SSR:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	plugins: [brixter(), sveltekit()],
	ssr: { noExternal: ['brixter'] }
});
```

That's the whole setup. There's no database, no server hooks, and no runtime service to configure — pages compile at build time.

## Authoring pages

A page is a `+page.brix.yaml` file placed exactly where you'd put a `+page.svelte`. **Its URL is its location in `src/routes`** — no slugs, no mapping table.

```yaml
# src/routes/+page.brix.yaml  →  /
title: Ship pages, not tickets.
description: A marketing site whose content lives in your repo.
components:
  - type: Hero
    props:
      eyebrow: Brixter
      headline: The content is in your codebase.
      cta: { label: Get started, href: /docs }
  - type: Pricing
    props:
      plans: [...]
```

The plugin compiles this into a Svelte page that:

- renders each entry in `components` (matched by `type`) from your brik directory,
- exposes the rest of the document as page **metadata** (exported as `metadata`), and
- injects `<BrixSeo {...metadata} />` into `<head>` (see [SEO](#seo)).

Everything that isn't `components` or `layout` is treated as metadata.

## Authoring briks

A _brik_ is a reusable section — a hero, a pricing table, a testimonial wall. Each `type` referenced by a page resolves to a component in `$lib/brixter/brix/` (`Hero` → `$lib/brixter/brix/Hero.brix`).

A `.brix` file is annotated HTML. `data-brixter-*` attributes mark which parts are content-driven, so the same markup renders on the site and drives the visual editor:

```html
---
description: Primary hero with promise, subtitle, and CTA.
---

<section class="...">
	<p data-brixter-field="eyebrow">Eyebrow</p>
	<h1 data-brixter-field="headline" data-brixter-kind="richtext-inline">Headline goes here.</h1>
	<a href="#" data-brixter-field="cta.label" data-brixter-bind="href:cta.href">Get started</a>
	<img src="" alt="" data-brixter-field="screenshot" data-brixter-kind="image" />
</section>
```

- `data-brixter-field="path"` — binds an element's content to a prop (dot-paths like `cta.label` are supported).
- `data-brixter-kind="richtext-inline" | "image" | "icon"` — declares the field's editor kind.
- `data-brixter-bind="attr:path"` — binds an attribute (e.g. `href`) to a prop.
- `data-brixter-collection-item="items"` — repeats the element once per entry in an array field.
- The optional `--- ... ---` frontmatter carries a `fields:` schema to add defaults or override inferred field config. It is not rendered.

`.brix` markup is interpreted at runtime via `@brixter/core`. If you'd rather hand-write a brik as a Svelte component, drop a `Hero.svelte` in the same directory instead — the plugin picks `.brix` when present, otherwise falls back to `.svelte`.

## Controllers (progressive enhancement)

`.brix` files are **pure markup — no `<script>`**. The interactivity that would live in a Svelte component's `<script>` lives instead in vanilla JS/TS **controllers**: small modules that progressively enhance the rendered DOM by hooking onto elements marked with `data-*` attributes.

### The convention

Drop controller files in `$lib/brixter/controllers/`:

```
src/lib/brixter/
├── brix/
│   └── Hero.brix          ← pure markup, no <script>
└── controllers/
    └── hero.ts            ← behaviour for Hero.brix
```

By convention **the file name mirrors the brik it enhances** — `Hero.brix` ↔ `controllers/hero.ts`. This is a documented pairing only; nothing enforces it at runtime, so a controller is free to enhance elements from any brik.

### Writing a controller

Each file exports an **init function** with the signature `(root: ParentNode) => () => void`: it attaches behaviour and returns a **cleanup**. A controller hooks **every** element that matches its selector (`querySelectorAll(...).forEach(...)`), so it serves N elements, not one. Accumulate a per-instance teardown for each and return them together:

```ts
// src/lib/brixter/controllers/hero.ts
import type { BrixController } from 'brixter/controllers';

export const initHeroReveal: BrixController = (root = document) => {
	const cleanups: Array<() => void> = [];
	root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) (entry.target as HTMLElement).dataset.revealed = 'true';
			}
		});
		observer.observe(el);
		cleanups.push(() => observer.disconnect()); // per-instance teardown
	});
	return () => cleanups.forEach((fn) => fn());
};
```

Then reference the hook in the markup:

```html
<!-- Hero.brix -->
<section data-reveal>…</section>
```

> **Per-instance cleanup matters.** Because one controller enhances many elements, its returned cleanup must undo _every_ instance it attached — hence the `cleanups` array. A controller that only detaches its last element would leak listeners on every navigation.

### Auto-registration

There is **no registry to maintain**. The Vite plugin collects the folder with `import.meta.glob('$lib/brixter/controllers/*.{ts,js}', { eager: true })` and `initBrixControllers` runs every exported init (the default export and any named export that is a function). **Adding a file registers it; deleting it unregisters it** — you never touch a central list.

Execution order is **deterministic**: `import.meta.glob` does not guarantee ordering, so modules are sorted by path (and exports by name) before running.

### Wiring the lifecycle

Controllers touch the DOM, so they only run on the **client**. Run them from your root `+layout.svelte` on `afterNavigate`, tearing down the previous run **before** re-attaching — this is what keeps repeated client navigations from accumulating duplicate listeners:

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

`initBrixControllers(root: ParentNode = document)` is **SSR-safe**: on the server (no `document`) it is a no-op returning a no-op cleanup. It returns a **combined cleanup**, and errors are **isolated** — if one controller throws, it is logged with a `[brix]` prefix and the rest still run.

### Owning the glob yourself

Prefer to collect the modules yourself (custom directory, non-SvelteKit host, tests)? Call the runner directly with any eager glob — `import.meta.glob` must be a literal at your call site:

```ts
import { runBrixControllers } from 'brixter/controllers';

const modules = import.meta.glob('./controllers/*.{ts,js}', { eager: true });
const teardown = runBrixControllers(modules /*, root */);
```

### Stimulus-style `data-controller` (opt-in)

The default convention pairs each controller with its own `data-*` hook (`[data-tilt]`, `[data-reveal]`). If you'd rather route by name in one attribute — [Stimulus](https://stimulus.hotwired.dev/)-style — have a controller match `[data-controller~="hero"]` instead:

```ts
export const initHero: BrixController = (root = document) => {
	const cleanups: Array<() => void> = [];
	root.querySelectorAll<HTMLElement>('[data-controller~="hero"]').forEach((el) => {
		/* … */
	});
	return () => cleanups.forEach((fn) => fn());
};
```

```html
<section data-controller="hero">…</section>
```

This is purely a selector choice — both styles use the exact same folder, signature, and lifecycle.

## Layouts

Set `layout: <Name>` on a page (or configure a `defaultLayout`) to wrap its content in a component from `$lib/brixter/layouts/<Name>.svelte`. The layout receives the page `metadata` both as a `metadata` prop and spread as individual props.

## SEO

For every compiled page, the plugin renders `<BrixSeo>` from the page metadata. Supported fields:

| Field         | Renders                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `title`       | `<title>`                                                                                   |
| `description` | `<meta name="description">`                                                                 |
| `canonical`   | `<link rel="canonical">`                                                                    |
| `robots`      | `<meta name="robots">` (e.g. `index,follow`, `noindex`)                                     |
| `og`          | Open Graph tags (`og.title`, `og.description`, `og.image`, `og.url`, `og.type`)             |
| `twitter`     | Twitter Card tags (`twitter.card`, `twitter.title`, `twitter.description`, `twitter.image`) |
| `jsonLd`      | One or more `<script type="application/ld+json">` blocks                                    |

Root-relative URLs in `og.image`, `og.url`, `twitter.image`, and `canonical` are absolutized against the request origin, since social crawlers don't resolve relative paths. Under `adapter-node` this comes from the `ORIGIN` env.

Automatic injection can be turned off with `brixter({ seo: false })`, and you can render `<BrixSeo>` yourself from any Svelte page:

```svelte
<script>
	import BrixSeo from 'brixter/seo';
</script>

<BrixSeo title="About us" description="…" />
```

## Theming

Briks are styled with Tailwind utilities and a small theme contract. Import the base styles and declare the dark-mode variant your briks rely on:

```css
/* your app's global stylesheet */
@import 'brixter/styles.css';
@variant dark (&:where(.dark, .dark *));
```

For a light/dark toggle, use the theming primitives from the package root:

```svelte
<script>
	import { ThemeController, themePreference } from 'brixter';
</script>

<ThemeController />
```

`themePreference` is a store (`'system' | 'light' | 'dark'`) persisted to `localStorage`; `<ThemeController>` applies the `.dark` class to the document accordingly.

## Vite plugin options

```ts
brixter({
	brixDir: '$lib/brixter/brix', // where brik components live
	layoutsDir: '$lib/brixter/layouts', // where layout components live
	controllersDir: '$lib/brixter/controllers', // where progressive-enhancement controllers live
	defaultLayout: undefined, // layout used when a page omits `layout`
	seo: true // inject <BrixSeo> into every page
});
```

## License

[MIT](../../LICENSE)
