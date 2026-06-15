# brixter

Brixter CMS package for SvelteKit apps.

---

## Part 1 — Special Files Support

Brixter uses two special file types that need build-time handling:

| Extension | Purpose | Handled by |
|-----------|---------|------------|
| `.brix.svelte` | Annotated Svelte markup with auto-inferred builder schema | Svelte preprocessor (`@brixter/brix-builder/preprocess`) |
| `.brix.yaml` / `.brix.yml` | Declarative page definitions compiled into Svelte components | Vite plugin (`brixter/vite`) |

### 1.1 Install the packages

```sh
npm install brixter @brixter/brix-builder
```

`@brixter/brix-builder` provides the Svelte preprocessor for `.brix.svelte` files.
`brixter` provides the Vite plugin for `.brix.yaml` compilation and the dashboard runtime.

### 1.2 Configure the Svelte preprocessor

In `svelte.config.js`, register the file extensions and add the `brixter` preprocessor:

```js
import { brixter } from '@brixter/brix-builder/preprocess';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
    extensions: ['.svelte', '.brix.svelte', '.brix.yaml', '.brix.yml'],
    preprocess: [brixter(), vitePreprocess()]
};

export default config;
```

- `extensions` tells SvelteKit to treat `.brix.yaml`, `.brix.yml`, and `.brix.svelte` as routable page files.
- The `brixter()` preprocessor transforms `.brix.svelte` files at build time: it injects `$props()`, auto-infers the builder schema from `data-brixter-field` and `data-brixter-collection-item` annotations, and wraps collection items in `{#each}` blocks.

### 1.3 Configure the Vite plugin

In `vite.config.ts`, add the Brixter Vite plugin **before** `sveltekit()`:

```ts
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
    plugins: [tailwindcss(), brixter({ adminPath: '/admin' }), sveltekit()]
});
```

The `brixter()` Vite plugin:
- Compiles `.brix.yaml` / `.brix.yml` files into Svelte components at transform time.
- Resolves the brik component directory (`$lib/brixter/brix` by default) and layout directory (`$lib/brixter/layouts` by default).
- Injects build-time repo metadata so the dashboard knows the GitHub repo, branch, and commit.
- Auto-enables `BRIXTER_MODE=local` in dev so you can use the CMS without GitHub credentials.

---

## Part 2 — Dashboard Wiring

The dashboard is a SvelteKit app mounted under `/admin`. It needs route shims, layout isolation, hooks, and environment configuration.

### 2.1 Route structure

```
src/routes/
  +layout.svelte              # pass-through only
  (site)/
    +layout.svelte            # your site shell (navbar, footer, CSS)
    +page.svelte              # your pages
    ...
  __brixter/
    +layout@.svelte           # CMS layout (imports ./layout.css)
    layout.css                # CMS Tailwind entry
    [...path]/
      +page.svelte
      +page.server.ts
    api/
      [...api]/
        +server.ts
```

### 2.2 Route shim files

**`src/routes/__brixter/[...path]/+page.server.ts`**:
```ts
export { actions, load } from 'brixter/sveltekit/server';
```

**`src/routes/__brixter/[...path]/+page.svelte`**:
```svelte
<script lang="ts">
    import Brixter from 'brixter/sveltekit';

    let { data, form } = $props();
</script>

<Brixter {data} {form} />
```

**`src/routes/__brixter/api/[...api]/+server.ts`**:
```ts
export { GET, POST } from 'brixter/sveltekit/api';
```

**`src/routes/__brixter/+layout@.svelte`**:
```svelte
<script lang="ts">
    import './layout.css';

    let { children } = $props();
</script>

{@render children()}
```

**`src/routes/__brixter/layout.css`**:
```css
@import 'tailwindcss';
@import 'brixter/styles.css';
@import '../../lib/brixter/theme.css';
@source '../../lib/brixter/brix';
@plugin '@tailwindcss/typography';
```

### 2.3 Layout isolation

The root `src/routes/+layout.svelte` must be pass-through only:

```svelte
<script lang="ts">
    let { children } = $props();
</script>

{@render children()}
```

Move all site chrome (navbar, footer, global CSS imports, favicon) into `src/routes/(site)/+layout.svelte`. The `+layout@.svelte` on `__brixter/` skips the `(site)` layout group, so the CMS does not inherit your site shell. The root layout still applies, which is why it must stay pass-through.

### 2.4 Theme contract

Create `src/lib/brixter/theme.css`:
```css
@variant dark (&:where(.dark, .dark *));
```

This is the host-owned brik render contract. Both the site CSS and the CMS `layout.css` import it.

### 2.5 Hooks

**`src/hooks.ts`**:
```ts
export { reroute } from 'brixter/sveltekit/reroute';
```

**`src/hooks.server.ts`**:
```ts
import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
```

If you already have hooks, compose Brixter into them with `sequence()` instead of replacing.

### 2.6 Environment configuration

```dotenv
DATABASE_URL=data/brixter.db
ORIGIN="http://localhost:5173"
BRIXTER_AUTH_SECRET="change-me"
GITHUB_APP_ID=""
GITHUB_PRIVATE_KEY=""
GITHUB_INSTALLATION_ID=""
GITHUB_REPO_OWNER=""
GITHUB_REPO_NAME=""
GITHUB_DEFAULT_BRANCH=""
BRIXTER_SOURCE_REPO=""
BRIXTER_SOURCE_DEFAULT_BRANCH=""
BRIXTER_SOURCE_COMMIT=""
```

Instead of `GITHUB_REPO_OWNER` + `GITHUB_REPO_NAME`, you can set `BRIXTER_SOURCE_REPO=owner/name`.

Optional overrides (defaults shown):

```dotenv
BRIXTER_ADMIN_PATH=/admin
BRIXTER_APP_ROOT=
BRIXTER_ROUTES_ROOT=src/routes
BRIXTER_MEDIA_DIR=static
```

#### Required values

These must be set to real values before the CMS works:

- `ORIGIN`
- `BRIXTER_AUTH_SECRET` (any random string)
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_INSTALLATION_ID`
- `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` (or `BRIXTER_SOURCE_REPO`)

In local dev mode (`BRIXTER_MODE=local`, auto-enabled by the Vite plugin in non-production), GitHub credentials are not required.

### 2.7 Run migrations

```sh
npx brixter migrate
```

This creates the Better Auth schema and Brixter tables in the database at `DATABASE_URL`.

---

## Split layout

If you need the site and the CMS to run as separate processes (e.g. separate containers), use the split layout. This keeps one codebase and one SvelteKit package, but switches between two build variants via `BRIXTER_VARIANT`:

| Variant | Env file    | Route tree          | Hooks per variant                        |
|---------|-------------|---------------------|------------------------------------------|
| `site`  | `.env.site` | `src/routes-site/`  | pass-through (no DB, no reroute)         |
| `cms`   | `.env.cms`  | `src/routes-cms/`   | full Brixter auth + reroute              |

Key differences from embedded:

- `svelte.config.js` switches `kit.files.routes` and `kit.files.hooks` based on `BRIXTER_VARIANT`.
- Vite needs an early env loader in `vite.config.ts` that reads `.env.site` or `.env.cms` before the config is evaluated.
- The route shim files go under `src/routes-cms/__brixter/` instead of `src/routes/__brixter/`.
- The site layout lives flat in `src/routes-site/` (no route group).
- Hooks are split into `hooks.site.ts`, `hooks.cms.ts`, `hooks.server.site.ts`, `hooks.server.cms.ts`, `hooks.universal.site.ts`, `hooks.universal.cms.ts` (reroute is a universal hook).
- Set `BRIXTER_ROUTES_ROOT=src/routes-site` in `.env.cms` so the explorer operates on the site route tree.
- Add variant-specific npm scripts to `package.json` (`dev:site`, `dev:cms`, etc.).
- The CMS variant needs `src/routes-cms/+page.server.ts` that redirects `/` to `/admin`.

---

## Explorer

The dashboard explorer is SvelteKit-first: it starts from the app's routes directory. In split layout, set `BRIXTER_ROUTES_ROOT=src/routes-site` in `.env.cms` so the CMS edits the site's GitHub routes.

## `.brix.yaml` Pages

Brixter's Vite plugin compiles `.brix.yaml` and `.brix.yml` files into Svelte pages. The generated component exports `metadata`, exposes valid metadata keys such as `title` and `description` as local variables, renders components from `$lib/brixter/brix`, and wraps content in a layout from `$lib/brixter/layouts` when `layout` is set.

For SvelteKit route discovery, make sure the app's `svelte.config` includes:

```js
extensions: ['.svelte', '.brix.yaml', '.brix.yml'];
```

## Config resolution order

When Brixter resolves config at runtime:

1. `configureBrixter(...)` programmatic overrides
2. Values from the active env file (`.env` in embedded, `.env.cms`/`.env.site` in split)
3. `import.meta.env` / `process.env`
4. Vite-injected build metadata (repo, branch, commit, paths)
5. Built-in defaults

## License

[MIT](./LICENSE)