# brixter

Brixter CMS package for SvelteKit apps.

## Init

If you want to wire Brixter manually instead of running `brixter init`, use these guides:

- [Embedded configuration](./EMBEDDED_CONFIGURATION.md)
- [Split configuration](./SPLIT_CONFIGURATION.md)

From your SvelteKit app directory, run:

```sh
npx brixter init
```

The init command adds `brixter` to `package.json` and runs your package manager,
creates the hidden `__brixter` route shims (including a scoped layout that
imports a single CMS `layout.css` entry), wires SvelteKit hooks, adds the Vite plugin,
documents required environment variables in `.env.example`, creates `.env` when
missing, and applies Better Auth plus brixter SQL migrations to `DATABASE_URL`.
It does not copy dashboard implementation files into the app.

On first run, init asks where Brixter should live:

```
Where should Brixter run?

  1) Same app as my site (default)
  2) Separate CMS routes
```

**Same app (embedded)** — one deploy. Admin mounts at `/admin` via SvelteKit
`reroute` (URL only; layout selection follows the rerouted route under
`__brixter/`). Init creates a `(site)` [route group](https://svelte.dev/docs/kit/advanced-routing#Group)
and moves your pages there so site chrome does not wrap the CMS.

To build this layout manually, follow [Embedded configuration](./EMBEDDED_CONFIGURATION.md).

**Layout isolation:** SvelteKit always applies the root `+layout.svelte`; `+layout@`
on `__brixter/` only skips intermediate layouts (e.g. `(site)`), not the root.
Keep the root layout pass-through (`{@render children()}` only). Put Tailwind,
favicon, and site chrome in `(site)/+layout.svelte`. Brixter styles live in
`__brixter/layout.css`, which imports `brixter/styles.css` and the host-owned
`src/lib/brixter/theme.css` in a single Tailwind pipeline.

**Separate CMS routes (split)** — still **one SvelteKit app**, but two build
variants selected by `BRIXTER_VARIANT`:

| Variant | Env         | Routes             | Hooks                |
| ------- | ----------- | ------------------ | -------------------- |
| `site`  | `.env.site` | `src/routes-site/` | pass-through (no DB) |
| `cms`   | `.env.cms`  | `src/routes-cms/`  | full brixter auth    |

Runtime and `brixter migrate` both resolve env from `.env.cms` / `.env.site` when
`BRIXTER_VARIANT` is set (not from `.env`). Split init also patches `vite.config`
so Vite sees the same values at dev time.

Each variant is a separate process / Docker Compose stack with its own route
tree (`kit.files.routes`). Site pages live directly under `src/routes-site/`
(flat — no route group); CMS admin lives under `src/routes-cms/__brixter/`
(public URL `/admin`).

To build this layout manually, follow [Split configuration](./SPLIT_CONFIGURATION.md).

```sh
npm run dev:site    # port 5173
npm run dev:cms     # port 5174

docker compose -f docker-compose.site.yml up
docker compose -f docker-compose.cms.yml up
```

Docker builds use `Dockerfile.brixter` with `BRIXTER_VARIANT=site|cms`. For
production containers, switch to `@sveltejs/adapter-node` (the template expects
a `build/` Node server).

Useful options:

```sh
brixter init --dry-run
brixter init --layout embedded
brixter init --layout split
brixter init --cwd ./apps/web
brixter init --admin-path /admin
brixter init --skip-install
brixter init --skip-migrate
```

The visual page builder ships as a dependency of `brixter`
([`@brixter/brix-builder`](../brix-builder)); you normally do not install it
separately.

To re-run database migrations (Better Auth schema + brixter SQL):

```sh
npx brixter migrate
# split layout: npm run db:migrate  (uses .env.cms via BRIXTER_VARIANT=cms)
```

## Host app layout

### Embedded (one variant)

```
src/routes/
  +layout.svelte              # minimal — global Tailwind import
  layout.css
  lib/brixter/
    theme.css                 # host-owned brik render contract
  (site)/
    +layout.svelte            # navbar, footer, marketing shell
    +page.svelte
  __brixter/
    +layout@.svelte           # imports only ./layout.css
    layout.css                # imports brixter/styles.css + ../../lib/brixter/theme.css
    [...path]/+page.svelte
```

Route groups use parentheses and do not affect URLs — `(site)/+page.svelte` is
still served at `/`.

### Split (two variants, one package)

```
src/routes-site/              # BRIXTER_VARIANT=site
  +layout.svelte              # site shell + layout.css
  layout.css
  +page.brix.yaml
src/lib/brixter/
  theme.css                   # host-owned brik render contract
src/routes-cms/               # BRIXTER_VARIANT=cms
  __brixter/
    +layout@.svelte
    layout.css                # imports brixter/styles.css + ../../lib/brixter/theme.css
    [...path]/
src/hooks.site.ts             # site client hooks (empty)
src/hooks.cms.ts              # cms client hooks (empty)
src/hooks.universal.site.ts   # site universal hooks (empty)
src/hooks.universal.cms.ts    # reroute /admin → /__brixter
src/hooks.server.site.ts      # site server hooks (pass-through)
src/hooks.server.cms.ts       # brixter auth handle
```

`reroute` is a **universal** hook in SvelteKit — it must live in
`hooks.universal.cms.ts`, not `hooks.cms.ts`. Split init archives legacy
`src/hooks.ts` so variant hooks are not overridden.

Run **`npm run dev:cms`** (port 5174) for `/admin`, not `npm run dev` — the
default dev script uses the site variant, which has no CMS routes.

Admin styles ship in `brixter/styles.css` and scope theme tokens to
`.brixter-root`, so they do not override your site's palette or toggle dark
mode on `document.body`.

Your host app needs:

- `@tailwindcss/vite` in `vite.config` (before `sveltekit()`)
- a host-owned `src/lib/brixter/theme.css` that defines the brik render contract
- `@import 'tailwindcss'` plus `@import '../lib/brixter/theme.css'` in your site stylesheet
- `__brixter/+layout@.svelte` importing only `./layout.css`
- `__brixter/layout.css` importing `brixter/styles.css`, `../../lib/brixter/theme.css`, and `@source` for your host brik components

Import `brixter/styles.css` inside the CMS `layout.css`, not from your root or CMS Svelte layout. Keep the brik render contract in host-owned CSS.

Upgrade to **0.0.5** or later if fonts or accent colors look wrong — earlier
0.0.4 builds did not run Brixter CSS through Tailwind correctly.

## Explorer

The dashboard explorer is SvelteKit-first: it starts from the app's routes
directory and shows route pages instead of arbitrary repository folders. In
split layout, configure `routesRoot` to your `routes-site` tree if you want the
CMS to edit the site's GitHub routes.

You can override discovery explicitly:

```ts
brixter({ appRoot: 'site', routesRoot: 'site/src/routes-site' });
```

## `.brix.yaml` Pages

Brixter's Vite plugin compiles `.brix.yaml` and `.brix.yml` files into Svelte
pages. The generated component exports `metadata`, exposes valid metadata keys
such as `title` and `description` as local variables, renders components from
`$lib/brixter/brix`, and wraps content in a layout from
`$lib/brixter/layouts` when `layout` is set.

For SvelteKit route discovery, make sure the app's `svelte.config` includes:

```js
extensions: ['.svelte', '.brix.yaml', '.brix.yml'];
```

## Developing

Start a development server:

```sh
npm run dev
# split layout:
npm run dev:site
npm run dev:cms
```

## Building

```sh
npm run build
# split layout:
npm run build:site
npm run build:cms
```

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## License

[MIT](./LICENSE)
