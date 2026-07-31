---
name: brixter-site
description: Build or extend a Brixter-compatible marketing site in SvelteKit — install and configure the Vite plugin, lay out the `$lib/brixter` directories, decide what becomes a brik vs a page prop, and wire theming, SEO, the sitemap and redirects. Use this whenever the project contains `.brix` / `.brix.yaml` files or the `brixter` dependency, or when asked to add a landing page, section, or marketing page to such a project.
---

# Building a Brixter site

Brixter keeps marketing content in the repo as files. A page is a declarative
`.brix.yaml` list of sections; a section (a _brik_) is annotated HTML; behaviour
lives in vanilla controllers. Nothing is fetched at runtime — pages compile at
build time.

Three companion skills cover the file types in depth. Read the one that matches
what you are about to write:

| Task                                                                         | Skill                |
| ---------------------------------------------------------------------------- | -------------------- |
| Author or edit a page (`+page.brix.yaml`), metadata, SEO, sitemap, redirects | `brixter-page`       |
| Author or edit a section (`.brix` markup, editable fields, collections)      | `brixter-brik`       |
| Add interactivity to a brik                                                  | `brixter-controller` |

## The mental model

```
src/
├── routes/
│   ├── +layout.svelte              ← runs initBrixControllers on afterNavigate
│   ├── +page.brix.yaml             ← the page at "/" : metadata + list of briks
│   └── pricing/+page.brix.yaml     ← the page at "/pricing"
└── lib/brixter/
    ├── brix/Hero.brix              ← reusable section, pure markup
    ├── layouts/Marketing.svelte    ← optional page wrapper
    └── controllers/hero.ts         ← behaviour for Hero.brix
```

- **A page's URL is its location in `src/routes`.** No slugs, no mapping table.
- **A page holds only content**; every visual decision lives in the brik.
- **A brik is reused across pages**; it never hardcodes copy that a page should own.

## Setup checklist

Verify these before writing any brik or page. If one is missing, add it.

**1. `package.json`** — `brixter` is a dependency (`npm install brixter`).
`@brixter/core` comes with it.

**2. `svelte.config.js`** — the page extensions are registered:

```js
const config = {
	extensions: ['.svelte', '.brix.yaml', '.brix.yml'],
	preprocess: [vitePreprocess()]
};
```

**3. `vite.config.ts`** — the plugin runs **before** `sveltekit()` and the
package stays bundled for SSR:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	plugins: [brixter(), sveltekit()],
	ssr: { noExternal: ['brixter'] }
});
```

Options (all optional, shown with their defaults):

```ts
brixter({
	brixDir: '$lib/brixter/brix',
	layoutsDir: '$lib/brixter/layouts',
	controllersDir: '$lib/brixter/controllers',
	defaultLayout: undefined,
	seo: true, // inject <BrixSeo> into every compiled page
	redirects: {} // serve page `aliases` in dev; `false` to disable
});
```

**4. Redirects (only if pages declare `aliases`)** — wrap the adapter so they
are compiled and emitted in its native format:

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { withRedirects } from 'brixter/sveltekit/redirects';

const config = { kit: { adapter: withRedirects(adapter()) } };
```

Netlify, Vercel and Cloudflare Pages are detected from the adapter; pass
`target` for anything else. Without this the `aliases` still work in dev but
nothing is emitted for production.

**5. Global stylesheet** — Brixter ships no stylesheet; the theme contract is
the app's own. Declare the dark variant briks rely on:

```css
@import 'tailwindcss';
@variant dark (&:where(.dark, .dark *));
```

There is no database, no server hook, no runtime service to configure.

## Workflow: adding a section to a site

Follow this order — it prevents the most common mistake, which is baking copy
into markup.

1. **Reuse before creating.** List `$lib/brixter/brix/`. If an existing brik
   fits the shape of the section (even with different copy), use it with new
   props instead of authoring a near-duplicate.
2. **Decide the field surface.** What varies per page (copy, links, images,
   list entries) becomes an editable field. What never varies (layout, spacing,
   colour, order) stays hardcoded in the markup.
3. **Write the brik** — see `brixter-brik`. Pure markup, no `<script>`, realistic
   placeholder content in the element bodies.
4. **Add it to the page** — see `brixter-page`. `type` matches the file name
   (`Hero.brix` → `type: Hero`).
5. **Add interactivity only if needed** — see `brixter-controller`.
6. **Verify** it renders: run the dev server and load the route.

## Conventions that keep a site coherent

- **Naming.** Briks are `PascalCase.brix` and named for what the section _is_
  (`Pricing`, `Reviews`, `FinalCta`), not where it sits (`Section2`).
- **Styling.** Briks are styled with Tailwind utilities plus the app's own theme
  contract — the semantic utilities defined in its global stylesheet (things like
  `text-heading`, `text-secondary`, `text-muted`, `font-display`). Read that
  stylesheet first and reuse what is already there; prefer those tokens over
  ad-hoc colours so light/dark stays consistent, and always pair a light class
  with its `dark:` variant.
- **One responsibility per brik.** A hero is a hero. If a section starts growing
  optional halves that pages toggle on and off, split it.
- **Content lives in the page.** A brik that renders the same words on every page
  either has a missing field or should not be a field at all.

## Theming

For a light/dark toggle use the primitives from the package root.
`<ThemeController>` toggles `.dark` on the element passed as `root` — pass one
explicitly, or nothing happens:

```svelte
<script>
	import { ThemeController } from 'brixter';

	let root = $state(null);
</script>

<div bind:this={root}>
	<ThemeController {root} />
	<!-- ... -->
</div>
```

`themePreference` is a store (`'system' | 'light' | 'dark'`) persisted to
`localStorage`.

## Layouts

`layout: <Name>` on a page wraps its content in
`$lib/brixter/layouts/<Name>.svelte` (or set `defaultLayout` in the plugin
options). The layout receives the page metadata both as a `metadata` prop and
spread as individual props.

## Svelte escape hatch

A brik can be a `Hero.svelte` in `$lib/brixter/brix/` instead of a `Hero.brix`.
The plugin prefers `.brix` when both exist. Reach for `.svelte` only when a
section genuinely needs component state or Svelte control flow — a `.svelte`
brik is **not** visually editable, so it costs the site its main advantage.
Default to `.brix` + a controller.
