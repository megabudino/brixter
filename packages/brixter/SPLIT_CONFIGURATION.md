# Split Configuration

This guide shows how to set up Brixter manually in split mode, without `brixter init`, while ending up with the same structure and runtime behavior.

Split mode means one codebase and one SvelteKit package, but two runtime variants selected with `BRIXTER_VARIANT`:

- `site` serves the public site
- `cms` serves the Brixter admin

## Target result

Your app should end up with a structure like this:

```text
src/
  hooks.site.ts
  hooks.cms.ts
  hooks.universal.site.ts
  hooks.universal.cms.ts
  hooks.server.site.ts
  hooks.server.cms.ts
  routes-site/
    +layout.svelte
    layout.css
    ...
  routes-cms/
    +page.server.ts
    __brixter/
      +layout@.svelte
      [...path]/+page.svelte
      [...path]/+page.server.ts
      api/[...api]/+server.ts
```

The key idea is:

- `BRIXTER_VARIANT=site` uses `src/routes-site`
- `BRIXTER_VARIANT=cms` uses `src/routes-cms`
- users still visit `/admin`
- the CMS variant has Brixter auth and reroute hooks, but the site variant does not

## 1. Install the package

Add `brixter` to your app:

```sh
npm install brixter
```

## 2. Split your route trees

Create these route roots:

```text
src/routes-site/
src/routes-cms/
```

Move your public site pages into `src/routes-site/`.

If your current app already uses `src/routes/`, the end result should be that normal pages live in `src/routes-site/` and only the CMS shim routes live in `src/routes-cms/`.

For the site layout, create `src/routes-site/+layout.svelte`:

```svelte
<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<!-- Site chrome -->
{@render children()}
```

Create `src/routes-site/layout.css` if you want the same starter CSS shape:

```css
@import 'tailwindcss';
@import '../lib/brixter/theme.css';
@plugin '@tailwindcss/typography';
```

Create `src/lib/brixter/theme.css` as the host-owned brik render contract:

```css
@variant dark (&:where(.dark, .dark *));
```

## 3. Add the hidden CMS route shims

Create `src/routes-cms/__brixter/[...path]/+page.server.ts`:

```ts
export { actions, load } from 'brixter/sveltekit/server';
```

Create `src/routes-cms/__brixter/[...path]/+page.svelte`:

```svelte
<script lang="ts">
	import Brixter from 'brixter/sveltekit';

	let { data, form } = $props();
</script>

<Brixter {data} {form} />
```

Create `src/routes-cms/__brixter/api/[...api]/+server.ts`:

```ts
export { GET, POST } from 'brixter/sveltekit/api';
```

Create `src/routes-cms/__brixter/+layout@.svelte`:

```svelte
<script lang="ts">
	import 'brixter/styles.css';
	import './layout.css';

	let { children } = $props();
</script>

{@render children()}
```

Create `src/routes-cms/__brixter/layout.css`:

```css
@import 'tailwindcss';
@import '../../lib/brixter/theme.css';
@plugin '@tailwindcss/typography';
```

Create `src/routes-cms/+page.server.ts` so the CMS variant redirects `/` to `/admin`:

```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(302, '/admin');
};
```

If you use a different admin path, change the redirect target to match it.

## 4. Split your hooks by variant

Create `src/hooks.site.ts`:

```ts
/** Site variant: no client hooks */
```

Create `src/hooks.cms.ts`:

```ts
/** CMS variant: no client hooks */
```

Create `src/hooks.universal.site.ts`:

```ts
/** Site variant: no universal hooks */
```

Create `src/hooks.universal.cms.ts`:

```ts
export { reroute } from 'brixter/sveltekit/reroute';
```

Create `src/hooks.server.site.ts`:

```ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = ({ event, resolve }) => resolve(event);
```

Create `src/hooks.server.cms.ts`:

```ts
import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
```

The important distinction is that the CMS variant owns the reroute and auth middleware, while the site variant stays pass-through.

## 5. Wire `svelte.config.*` to `BRIXTER_VARIANT`

Configure SvelteKit so routes and hooks switch by variant.

The target shape is:

```ts
const brixterVariant = process.env.BRIXTER_VARIANT === 'cms' ? 'cms' : 'site';
```

Then in `kit.files`:

```ts
files: {
	routes: brixterVariant === 'cms' ? 'src/routes-cms' : 'src/routes-site',
	hooks: {
		client: brixterVariant === 'cms' ? 'src/hooks.cms' : 'src/hooks.site',
		server: brixterVariant === 'cms' ? 'src/hooks.server.cms' : 'src/hooks.server.site',
		universal: brixterVariant === 'cms' ? 'src/hooks.universal.cms' : 'src/hooks.universal.site'
	}
}
```

Also make sure `extensions` includes:

```js
extensions: ['.svelte', '.brix.yaml', '.brix.yml'];
```

## 6. Add the Vite plugin

In `vite.config.ts` or `vite.config.js`, add:

```ts
import { brixter } from 'brixter/vite';
```

Then include it in `plugins`:

```ts
brixter({ adminPath: '/admin' });
```

If you want a different mount path, pass a different `adminPath`, but `/admin` is the safest choice in the current version.

## 7. Make Vite read the right env file per variant

Because Vite config runs before Brixter runtime config, add a tiny loader near the top of `vite.config.*` so variant-specific env files are available during config evaluation:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(function loadBrixterVariantEnv() {
	const variant = process.env.BRIXTER_VARIANT;
	const envFile = variant === 'cms' ? '.env.cms' : variant === 'site' ? '.env.site' : null;
	if (!envFile) return;
	const envPath = resolve(process.cwd(), envFile);
	if (!existsSync(envPath)) return;
	for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
		if (!line || line.trimStart().startsWith('#')) continue;
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
		process.env[match[1]] = value;
	}
})();
```

This is not the runtime config loader. It is only there so Vite sees `.env.site` or `.env.cms` early enough.

## 8. Create the env files

Create `.env.site`:

```dotenv
ORIGIN="http://localhost:5173"
BRIXTER_SOURCE_REPO=""
BRIXTER_SOURCE_DEFAULT_BRANCH=""
BRIXTER_SOURCE_COMMIT=""
```

Create `.env.cms`:

```dotenv
DATABASE_URL=data/brixter.db
ORIGIN="http://localhost:5174"
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

### Required in CMS mode

These need real values before the CMS can work:

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

### Important manual config

If you want the CMS explorer and route editing features to operate on the public site route tree, add this to `.env.cms`:

```dotenv
BRIXTER_ROUTES_ROOT=src/routes-site
```

This is important in split mode because the default runtime fallback is still `<appRoot>/src/routes`.

If your media files are not under the default `static/` directory, also set:

```dotenv
BRIXTER_MEDIA_DIR=static
```

## 9. Add scripts for each variant

Add these scripts to `package.json`:

```json
{
	"dev:site": "BRIXTER_VARIANT=site vite dev --port 5173",
	"dev:cms": "BRIXTER_VARIANT=cms vite dev --port 5174",
	"build:site": "BRIXTER_VARIANT=site vite build",
	"build:cms": "BRIXTER_VARIANT=cms vite build",
	"preview:site": "BRIXTER_VARIANT=site vite preview --port 5173",
	"preview:cms": "BRIXTER_VARIANT=cms vite preview --port 5174",
	"db:migrate": "BRIXTER_VARIANT=cms brixter migrate"
}
```

Use `dev:cms` for the admin. The plain `vite dev` or `npm run dev` path usually boots the site variant, not the CMS variant.

## 10. Optional Docker parity

If you want the same deployment shape as the generated split setup, create:

- `docker-compose.site.yml`
- `docker-compose.cms.yml`
- `Dockerfile.brixter`

The important behavior to preserve is:

- site container runs with `BRIXTER_VARIANT=site`
- cms container runs with `BRIXTER_VARIANT=cms`
- site container reads `.env.site`
- cms container reads `.env.cms`
- cms container persists `./data` if you use the default SQLite path

## 11. Run migrations in CMS mode

Run:

```sh
BRIXTER_VARIANT=cms npx brixter migrate
```

Or use the script:

```sh
npm run db:migrate
```

This applies Better Auth migrations and Brixter migrations using CMS env resolution.

## 12. Optional icons

If you want the same local icon setup that init produces, copy Lucide SVGs into:

```text
src/lib/brixter/icons/lucide/
```

## 13. Verify the setup

Use this checklist:

1. `npm run dev:site` serves the public site on `5173`.
2. `npm run dev:cms` serves the CMS on `5174`.
3. Visiting `/admin` in the CMS variant opens Brixter.
4. The site variant does not load Brixter auth middleware.
5. Route editing points at `src/routes-site`, not `src/routes`.

## Config resolution order

Once the correct variant env file is selected, Brixter resolves config from:

1. `configureBrixter(...)` overrides, if you call it
2. values from the selected env file
3. `import.meta.env` or `process.env`
4. Vite-injected build metadata for repo-derived values
5. built-in defaults

In split mode, runtime env selection is:

- `BRIXTER_VARIANT=cms` -> `.env.cms`, otherwise `.env`
- `BRIXTER_VARIANT=site` -> `.env.site`, otherwise `.env`
