# brixter

The SvelteKit integration for [Brixter](../../README.md). It compiles `+page.md` pages into Svelte components, renders reusable content blocks (_briks_), checks every page against the schemas its briks infer, and wires SEO metadata into `<head>` — so your marketing content stays as versioned files in your repo.

> Prefer the big picture first? Start with the [project README](../../README.md).

## What's in this package

| Import                | What it is                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `brixter/vite`        | The Vite plugin that compiles `+page.md` pages and validates them against their briks.       |
| `brixter/seo`         | `<BrixSeo>`, the component that renders SEO metadata into `<head>`.                          |
| `brixter/controllers` | `initBrixControllers` + the `BrixController` type — progressive enhancement for brik markup. |
| `brixter`             | Theming primitives: `<ThemeController>` and the `themePreference` store helpers.             |

## Install

```sh
npm install brixter
```

You'll also need `@brixter/core` (installed as a dependency of `brixter`) — it provides the framework-agnostic render engine used at runtime.

## Configure

### 1. Register the page extensions

In `svelte.config.js`, tell SvelteKit to treat `.md` as a routable page extension:

```js
const config = {
	extensions: ['.svelte', '.md'],
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

A page is a `+page.md` file placed exactly where you'd put a `+page.svelte`. **Its URL is its location in `src/routes`** — no slugs, no mapping table.

```markdown
## <!-- src/routes/+page.md  →  / -->

metadata:
title: Ship pages, not tickets.
description: A marketing site whose content lives in your repo.
brix:

- type: Hero
  props:
  eyebrow: Brixter
  headline: The content is in your codebase.
  cta: { label: Get started, href: /docs }
- type: Pricing
  props:
  plans: [...]

---

Optional prose. It is compiled to HTML and handed to the layout as `content`.
```

The plugin compiles this into a Svelte page that:

- renders each entry in `brix` (matched by `type`) from your brik directory,
- exports the `metadata` block and injects `<BrixSeo {...metadata} />` into `<head>` (see [SEO](#seo)),
- compiles the markdown body and passes it to the layout as `content`, and
- **fails the build** if a page and a brik disagree (see [Validation](#validation)).

The frontmatter's top level is a closed set: `metadata`, `brix`, `layout`, `aliases`, `sitemap`. Anything else is an error, so a misspelled key is caught rather than quietly becoming metadata that renders nothing.

## Authoring briks

A _brik_ is a reusable section — a hero, a pricing table, a testimonial wall. Each `type` referenced by a page resolves to a component in `$lib/brixter/brix/` (`Hero` → `$lib/brixter/brix/Hero.brix`).

A `.brix` file is HTML with braces. `{ … }` marks what a page supplies, so the same markup renders on the site and drives the visual editor:

```brix
---
title: Hero
description: Primary hero with promise, subtitle, and CTA.
---

<section class="...">
	<p>{eyebrow ?? 'Eyebrow'}</p>
	<h1>{@richtext @required headline}</h1>
	<a href={cta.href ?? '#'}>{cta.label ?? 'Get started'}</a>
	<img src={@image screenshot} alt="" />
</section>
```

- `{path}` — a value, HTML-escaped, in element content or in an attribute. Dot paths work.
- `?? '…'` — the value used when the page omits the prop, and the placeholder the editor shows before content exists.
- `@tag` — annotations: `@richtext` / `@icon` / `@image` / `@url` / `@number` / `@boolean` / `@enum('a','b')` for the type, `@required` / `@min` / `@max` / `@pattern` for constraints, `@label('…')` for the editor.
- `{#each xs as x}` … `{/each}` — repeats its body once per entry; collections nest.
- `{#if e}` … `{:else}` … `{/if}` — conditionals.
- The frontmatter carries only `title` and `description`. **There is no schema to write:** the props a brik accepts are derived from the markup that reads them.

`.brix` markup is interpreted at runtime via `@brixter/core`. If you'd rather hand-write a brik as a Svelte component, drop a `Hero.svelte` in the same directory instead — the plugin picks `.brix` when present, otherwise falls back to `.svelte`. A `.svelte` brik has no template to infer from, so its props are not validated.

## Validation

Every page is checked against its briks at compile time. A prop the template never reads, a `@required` one that is missing, a value of the wrong type or outside an `@enum`, a brik that does not exist — each stops the build with a file, a line, a column and the path of the field at fault:

```
[brixter] 3 problems found:
  • src/routes/pricing/+page.md:6:11: no brik named `Hreo`. Did you mean `Hero`?
  • src/routes/pricing/+page.md:13:14: `plans` expects a list, but got text.
  • src/routes/pricing/+page.md:19:17: `headlien` is not used by this brik. Did you mean `headline`?
```

In `vite dev` the same problems raise the error overlay while the rest of the site keeps serving. `npx brixter check` gives the same answers without a build — use it in CI.

The plugin also writes TypeScript declarations for every brik's props to `$lib/brixter/brixter.generated.d.ts` (configurable with `types`, `false` to skip), so a bad prop shows up in your editor first. It is regenerated whenever a `.brix` changes; gitignore it.

## Controllers (progressive enhancement)

`.brix` files carry **no `<script>`**. The interactivity that would live in a Svelte component's `<script>` lives instead in vanilla JS/TS **controllers**: small modules that progressively enhance the rendered DOM by hooking onto elements marked with `data-*` attributes.

### The convention

Drop controller files in `$lib/brixter/controllers/`:

```
src/lib/brixter/
├── brix/
│   └── Hero.brix          ← template, no <script>
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

## Agent skills

Brixter ships the guides your coding agent needs to author briks, pages and
controllers correctly — the annotation syntax is specific, and a wrong path
fails silently rather than loudly. Install them into your project:

```sh
npx brixter skills install
```

There is no skill format shared across agents, so the command **translates** one
canonical source into each agent's own convention:

| Target     | Writes                                                         |
| ---------- | -------------------------------------------------------------- |
| `claude`   | `.claude/skills/<name>/SKILL.md`                               |
| `cursor`   | `.cursor/rules/<name>.mdc` (auto-attached by glob)             |
| `copilot`  | `.github/instructions/<name>.instructions.md` (`applyTo` glob) |
| `windsurf` | `.windsurf/rules/<name>.md`                                    |
| `agents`   | `.brixter/skills/` + a managed block in `AGENTS.md`            |

By default it writes for the agents it detects in your project, plus `AGENTS.md`
— which Codex, Amp, Zed, OpenCode and others read. Override with
`--agent claude,cursor` or `--agent all`. **Commit the result**: the files are
plain markdown, so they then cover every teammate regardless of the agent they run.

Four skills are installed, each activating on the files it governs:

| Skill                | Applies to                             |
| -------------------- | -------------------------------------- |
| `brixter-site`       | Setting up or extending a Brixter site |
| `brixter-brik`       | `**/*.brix`                            |
| `brixter-page`       | `**/+page.md`                          |
| `brixter-controller` | `**/lib/brixter/controllers/**`        |

Other commands: `npx brixter skills list` shows the skills and their globs;
`npx brixter skills status` reports which files are installed, locally modified,
or left over from an older version of the package (rerun `install` to refresh —
files you edited are skipped unless you pass `--force`). Add `--global` to
install into `~/.claude/skills`; other agents have no user-level rules directory,
so they are project-scoped only.

### Staying up to date

Once installed, the skills refresh themselves when you upgrade the package:

```sh
npm update brixter   # installed skills are rewritten to match the new version
```

A postinstall hook does this, under deliberate limits. It **only refreshes an
existing install** — adding `brixter` as a dependency never writes agent files
into a project that has not run `skills install`. It never overwrites a file you
edited (those are listed, and need `--force`). And it never fails your install:
if anything goes wrong it prints a note and exits cleanly. Set
`BRIXTER_SKIP_POSTINSTALL=1` to disable it.

Treat this as a convenience rather than a guarantee — pnpm and Bun block
dependency lifecycle scripts unless the package is trusted, and
`--ignore-scripts` skips them everywhere. `npx brixter skills status` is the
reliable check, and `npx brixter skills install` always works.

## Layouts

Set `layout: <Name>` on a page (or configure a `defaultLayout`) to wrap its content in a component from `$lib/brixter/layouts/<Name>.svelte`. The layout receives three props: `metadata` (the page's frontmatter metadata block), `children` (its briks, in order), and `content` — the page's markdown body, compiled to HTML.

```svelte
<!-- $lib/brixter/layouts/Marketing.svelte -->
<script>
	let { metadata, content, children } = $props();
</script>

{@render children()}

{#if content}
	<article class="prose">{@html content}</article>
{/if}
```

A layout that renders `content` is what lets a page carry editorial prose without a brik for it. With no layout, the body renders after the sections.

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

## Sitemap

Add a `sitemap.xml` that auto-discovers every page under `src/routes` — `+page.md` and `+page.svelte` alike — with one file:

```ts
// src/routes/sitemap.xml/+server.ts
export { GET, prerender } from 'brixter/sveltekit/sitemap';
```

In dev (SSR) `<loc>` uses the request origin automatically. Sitemaps need **absolute** URLs, so for a prerendered build provide your canonical origin via `siteUrl` — under prerendering SvelteKit's request origin is synthetic:

```ts
// src/routes/sitemap.xml/+server.ts
import { createSitemap } from 'brixter/sveltekit/sitemap';
export const { GET, prerender } = createSitemap({ siteUrl: 'https://example.com' });
```

To drive the origin from an env file, read it in your `+server.ts` and pass it through:

```ts
import { PUBLIC_SITE_URL } from '$env/static/public';
import { createSitemap } from 'brixter/sveltekit/sitemap';
export const { GET, prerender } = createSitemap({ siteUrl: PUBLIC_SITE_URL });
```

Per-page control lives in the page's frontmatter (no extra config):

- `metadata.robots: noindex` (or `noindex,nofollow`) — excluded from the sitemap.
- `sitemap: false` — excluded.
- `sitemap: { changefreq, priority, lastmod, loc }` — override individual fields (`loc` sets an explicit URL).

`robots` sits under `metadata` because it renders a `<head>` tag; `sitemap` is a build directive and sits at the top level.

Route groups `(marketing)` are collapsed and dynamic `[slug]` routes are skipped from the automatic set — feed those from your data with `additionalPaths`:

```ts
export const { GET, prerender } = createSitemap({
	siteUrl: 'https://example.com',
	additionalPaths: async () =>
		(await getPosts()).map((p) => ({ loc: `/blog/${p.slug}`, lastmod: p.updatedAt }))
});
```

`createSitemap` also accepts `trailingSlash`, `defaults` (`changefreq`/`priority`), and `filter`/`transform` hooks. The URL model and XML serializer are framework-agnostic (`@brixter/core/sitemap`), so the discovery layer is the only SvelteKit-specific part.

## Redirects

When a page replaces an old URL, the page says so. Add the old paths to its
`aliases`:

```yaml
# src/routes/pricing/+page.md  →  /pricing
metadata:
  title: Pricing
aliases:
  - /plans
  - /old-pricing
```

Wrap your adapter and every alias on the site is compiled into one map, emitted
in that adapter's native format:

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { withRedirects } from 'brixter/sveltekit/redirects';

export default {
	kit: { adapter: withRedirects(adapter()) }
};
```

Redirects are then served by the hosting layer with **real status codes**, before
any application code runs — `_redirects` for Netlify and Cloudflare Pages, routes
in `.vercel/output/config.json` for Vercel. Brixter never emits a meta refresh:
if it can't tell which deployment format an adapter produces, it fails the build
and asks for `target` rather than falling back to one.

`301` is the default. Use the long form when it isn't the right answer — a
temporary move, or a `303` after a form:

```yaml
aliases:
  - path: /black-friday
    status: 302
```

Chains are flattened: if `/a` aliases to `/b` and `/b` later moves to `/c`, both
ship pointing at `/c`, so the browser only ever makes one hop.

### The build refuses an incoherent redirect

Compilation happens inside `adapt`, where the content tree and SvelteKit's route
manifest are both available — so a broken redirect stops the build instead of
reaching production as a dead URL. Every message names the file holding the rule:

```
error during build:
Error: [brixter] redirects: 1 redirect could not be compiled:
  • src/routes/test/+page.md: alias `/sitemap.xml` collides with an
    existing path — it is already served by the site
```

Refused: an alias that shadows a route, page or static asset the site already
serves; the same alias claimed by two pages; a destination no route, page or
alias resolves to; and cycles. A dynamic route that _could_ have matched the
alias is not a collision — the alias is a statement that the URL moved, and on a
site with a catch-all route the opposite rule would forbid redirects entirely.

In `vite dev` there is no hosting layer, so the plugin answers aliases itself
with the same status code the edge would send. Inconsistencies are warnings
there, not failures — the build is where they stop the world.

### Options

```ts
withRedirects(adapter(), {
	target: undefined, // 'netlify' | 'vercel' | 'cloudflare'; detected from the adapter
	outDir: undefined, // deployment output dir; defaults to the target's convention
	sources: [], // extra rule sources, beyond page aliases
	trailingSlash: 'never',
	defaultStatus: 301,
	emit: true // false to validate without writing
});
```

Set `target` when the adapter can't name its own platform — `adapter-static`
deployed to Netlify, say. The compiler takes a **list** of sources: page aliases
are the first, and `sources` is where another goes — a central file for
redirects whose destination isn't a page, an export from a legacy CMS. They are
compiled together, under the same consistency rules:

```js
withRedirects(adapter(), {
	sources: () => [{ name: 'redirects.yaml', rules: readLegacyRedirects() }]
});
```

Each rule is `{ from, to, status?, file }` — `file` is what diagnostics point
at. Pass the same `sources` to `brixter({ redirects: { sources } })` so the dev
server sees them too. The compiler, path model and serializers are
framework-agnostic (`@brixter/core/redirects`); only the route-manifest and
adapter plumbing is SvelteKit-specific.

## Theming

Brixter ships no stylesheet. Briks are styled with plain Tailwind utilities, and the theme contract — your colour tokens, type scale and any shared component classes — lives in your own app's global stylesheet. Declare the dark-mode variant there:

```css
/* your app's global stylesheet */
@import 'tailwindcss';
@variant dark (&:where(.dark, .dark *));
```

For a light/dark toggle, use the theming primitives from the package root. `<ThemeController>` toggles the `.dark` class on the element you pass as `root` — pass it explicitly, or nothing happens:

```svelte
<script>
	import { ThemeController, themePreference } from 'brixter';

	let root = $state(null);
</script>

<div bind:this={root} class="app">
	<ThemeController {root} />
	<!-- ... -->
</div>
```

`themePreference` is a store (`'system' | 'light' | 'dark'`) persisted to `localStorage`.

## CLI

```sh
npx brixter check   # validate every page against its briks; exits non-zero on a problem
npx brixter types   # write the generated declarations without running Vite
npx brixter skills  # install the agent skills into this project
```

`check` runs the same inference and the same validator the plugin does, straight over the filesystem — so CI can ask "is this site coherent?" without a build.

## Vite plugin options

```ts
brixter({
	brixDir: '$lib/brixter/brix', // where brik components live
	layoutsDir: '$lib/brixter/layouts', // where layout components live
	controllersDir: '$lib/brixter/controllers', // where progressive-enhancement controllers live
	defaultLayout: undefined, // layout used when a page omits `layout`
	seo: true, // inject <BrixSeo> into every page
	editorAnchors: true, // emit the data-brixter-* attributes the editor binds to
	types: '$lib/brixter/brixter.generated.d.ts', // `false` to skip
	redirects: {} // serve page `aliases` in dev; `false` to disable
});
```

## License

[MIT](../../LICENSE)
