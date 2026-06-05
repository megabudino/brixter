# Embedded Configuration

This guide shows how to set up Brixter manually in embedded mode, without `brixter init`, while ending up with the same structure and runtime behavior.

Embedded means:

- one SvelteKit app
- one route tree under `src/routes`
- one env file, usually `.env`
- the CMS mounted inside the same app at `/admin`

## Target result

Your app should end up with a structure like this:

```text
src/
  hooks.ts
  hooks.server.ts
  routes/
    +layout.svelte
    (site)/
      +layout.svelte
      ...
    __brixter/
      +layout@.svelte
      [...path]/+page.svelte
      [...path]/+page.server.ts
      api/[...api]/+server.ts
```

The key idea is:

- public site routes live under `src/routes/(site)`
- CMS internals live under `src/routes/__brixter`
- users visit `/admin`, but a SvelteKit reroute hook sends that traffic to `__brixter`

## 1. Install the package

Add `brixter` to your app:

```sh
npm install brixter
```

Use your own package manager if you are not on npm.

## 2. Add the hidden CMS route shims

Create `src/routes/__brixter/[...path]/+page.server.ts`:

```ts
export { actions, load } from 'brixter/sveltekit/server';
```

Create `src/routes/__brixter/[...path]/+page.svelte`:

```svelte
<script lang="ts">
	import Brixter from 'brixter/sveltekit';

	let { data, form } = $props();
</script>

<Brixter {data} {form} />
```

Create `src/routes/__brixter/api/[...api]/+server.ts`:

```ts
export { GET, POST } from 'brixter/sveltekit/api';
```

Create `src/routes/__brixter/+layout@.svelte`:

```svelte
<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

{@render children()}
```

Create `src/routes/__brixter/layout.css`:

```css
@import 'tailwindcss';
@import 'brixter/styles.css';
@import '../../lib/brixter/theme.css';
@source '../../lib/brixter/brix';
@plugin '@tailwindcss/typography';
```

That layout keeps Brixter styles scoped to the CMS route tree instead of your whole app, while `src/routes/__brixter/layout.css` becomes the single CMS Tailwind entry that compiles both package chrome and the host-owned brik render contract for the CMS and preview.

## 3. Isolate your site layout from the CMS

Put your public pages under a route group:

```text
src/routes/(site)/
```

Move your existing site pages there, for example:

```text
src/routes/+page.svelte           -> src/routes/(site)/+page.svelte
src/routes/about/+page.svelte     -> src/routes/(site)/about/+page.svelte
```

Keep `src/routes/+layout.svelte` minimal:

```svelte
<script lang="ts">
	let { children } = $props();
</script>

{@render children()}
```

Move site chrome, global site CSS imports, favicon setup, and similar site-only concerns into `src/routes/(site)/+layout.svelte`.

Example:

```svelte
<script lang="ts">
	import '../layout.css';

	let { children } = $props();
</script>

<!-- Site chrome -->
{@render children()}
```

Create `src/lib/brixter/theme.css` as the host-owned render contract that both the site and CMS entries load:

```css
@variant dark (&:where(.dark, .dark *));
```

This separation matters because the root `+layout.svelte` still applies to `/admin`. If you keep Tailwind, theme classes, or marketing shell markup in the root layout, the CMS will inherit them.

## 4. Add the SvelteKit hooks

Create or update `src/hooks.ts`:

```ts
export { reroute } from 'brixter/sveltekit/reroute';
```

Create or update `src/hooks.server.ts`:

```ts
import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
```

If you already have hooks, compose Brixter into them instead of replacing your existing logic.

## 5. Add the Vite plugin

In `vite.config.ts` or `vite.config.js`, add the Brixter plugin:

```ts
import { brixter } from 'brixter/vite';
```

Then include it in `plugins`:

```ts
brixter({ adminPath: '/admin' });
```

If you want a different mount path, pass a different `adminPath`, but `/admin` is the safest choice in the current version because dashboard links still assume `/admin`.

## 6. Enable `.brix.yaml` pages in Svelte config

In `svelte.config.js` or `svelte.config.ts`, make sure `extensions` includes:

```js
extensions: ['.svelte', '.brix.yaml', '.brix.yml'];
```

## 7. Create your env file

Embedded mode reads `.env` by default. Start with:

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

Replace the placeholders before using the CMS.

### Required values

These need real values before Brixter can work:

- `ORIGIN`
- `BRIXTER_AUTH_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_INSTALLATION_ID`
- `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME`

Instead of setting `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME`, you can set:

```dotenv
BRIXTER_SOURCE_REPO=owner/name
```

### Optional overrides

You only need these when the defaults are wrong for your project:

```dotenv
BRIXTER_ADMIN_PATH=/admin
BRIXTER_APP_ROOT=
BRIXTER_ROUTES_ROOT=src/routes
BRIXTER_MEDIA_DIR=static
```

Defaults:

- `DATABASE_URL` -> `data/brixter.db`
- `GITHUB_DEFAULT_BRANCH` -> `main`
- `BRIXTER_ADMIN_PATH` -> `/admin`
- `BRIXTER_ROUTES_ROOT` -> `<appRoot>/src/routes`
- `BRIXTER_MEDIA_DIR` -> `<appRoot>/static`

## 8. Run migrations

Once env is in place, run:

```sh
npx brixter migrate
```

This applies Better Auth migrations and Brixter migrations using `DATABASE_URL`.

## 9. Optional icons

If you want the same local icon setup that init produces, copy Lucide SVGs into:

```text
src/lib/brixter/icons/lucide/
```

This step is optional and only matches the default init choice for icons.

## 10. Verify the setup

Use this checklist:

1. `/admin` opens the CMS.
2. Public pages still render from `src/routes/(site)`.
3. The CMS does not inherit your site shell or site-wide layout styling.
4. `.brix.yaml` pages resolve as SvelteKit pages.
5. Media and route editing point at the expected repo paths.

## Config resolution order

When Brixter resolves config in embedded mode, it uses:

1. `configureBrixter(...)` overrides, if you call it
2. values from `.env`
3. `import.meta.env` or `process.env`
4. Vite-injected build metadata for repo-derived values
5. built-in defaults

That means you can keep the setup entirely env-driven, or override specific values programmatically if your app needs that.
