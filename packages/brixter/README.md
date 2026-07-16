# brixter

The SvelteKit integration for [Brixter](../../README.md). It compiles declarative `.brix.yaml` pages into Svelte components, renders reusable content blocks (*briks*), and wires SEO metadata into `<head>` — so your marketing content stays as versioned files in your repo.

> Prefer the big picture first? Start with the [project README](../../README.md).

## What's in this package

| Import | What it is |
| --- | --- |
| `brixter/vite` | The Vite plugin that compiles `.brix.yaml` / `.brix.yml` pages. |
| `brixter/seo` | `<BrixSeo>`, the component that renders SEO metadata into `<head>`. |
| `brixter` | Theming primitives: `<ThemeController>` and the `themePreference` store helpers. |
| `brixter/styles.css` | Base stylesheet shared by briks. |

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
      plans: [ ... ]
```

The plugin compiles this into a Svelte page that:

- renders each entry in `components` (matched by `type`) from your brik directory,
- exposes the rest of the document as page **metadata** (exported as `metadata`), and
- injects `<BrixSeo {...metadata} />` into `<head>` (see [SEO](#seo)).

Everything that isn't `components` or `layout` is treated as metadata.

## Authoring briks

A *brik* is a reusable section — a hero, a pricing table, a testimonial wall. Each `type` referenced by a page resolves to a component in `$lib/brixter/brix/` (`Hero` → `$lib/brixter/brix/Hero.brix`).

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

## Layouts

Set `layout: <Name>` on a page (or configure a `defaultLayout`) to wrap its content in a component from `$lib/brixter/layouts/<Name>.svelte`. The layout receives the page `metadata` both as a `metadata` prop and spread as individual props.

## SEO

For every compiled page, the plugin renders `<BrixSeo>` from the page metadata. Supported fields:

| Field | Renders |
| --- | --- |
| `title` | `<title>` |
| `description` | `<meta name="description">` |
| `canonical` | `<link rel="canonical">` |
| `robots` | `<meta name="robots">` (e.g. `index,follow`, `noindex`) |
| `og` | Open Graph tags (`og.title`, `og.description`, `og.image`, `og.url`, `og.type`) |
| `twitter` | Twitter Card tags (`twitter.card`, `twitter.title`, `twitter.description`, `twitter.image`) |
| `jsonLd` | One or more `<script type="application/ld+json">` blocks |

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
  brixDir: '$lib/brixter/brix',       // where brik components live
  layoutsDir: '$lib/brixter/layouts', // where layout components live
  defaultLayout: undefined,           // layout used when a page omits `layout`
  seo: true                           // inject <BrixSeo> into every page
});
```

## License

[MIT](../../LICENSE)
