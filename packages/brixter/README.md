# brixter

Brixter CMS package for SvelteKit apps.

## Init

From your SvelteKit app directory, run:

```sh
npx brixter init
```

The init command adds `brixter` to `package.json` and runs your package manager,
creates the hidden `__brixter` route shims (including a scoped layout that
imports `brixter/styles.css`), wires SvelteKit hooks, adds the Vite plugin,
documents required environment variables in `.env.example`, creates `.env` when
missing, and applies Better Auth plus brixter SQL migrations to `DATABASE_URL`.
It does not copy dashboard implementation files into the app.

On first run, init asks where Brixter should live:

```
Where should Brixter run?

  1) Same app as my site (default)
  2) Separate CMS app
```

**Same app (embedded)** — current default. Admin mounts at `/admin` inside your
site via SvelteKit `reroute`. One deploy, one database.

**Separate CMS app (split)** — your site keeps the Vite page builder only (no
admin routes, hooks, or database). Init also scaffolds a sibling `cms/` app with
the full admin UI, auth, and migrations. Point the site at the CMS with
`BRIXTER_CMS_URL`. The CMS Vite plugin uses `appRoot` so the route explorer
still targets your site's `src/routes` in GitHub.

Useful options:

```sh
brixter init --dry-run
brixter init --layout embedded
brixter init --layout split
brixter init --cms-dir ./apps/cms
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
```

## Host app layout

Brixter mounts at `/admin` via SvelteKit `reroute` and renders inside your app
tree. To keep your site's navbar, footer, and global CSS from wrapping the
dashboard, use a minimal root layout and move site chrome into a route group:

```
src/routes/
  +layout.svelte              # slot only — your global Tailwind import lives here
  (site)/
    +layout.svelte            # navbar, footer, marketing shell
    +page.svelte
  __brixter/
    +layout.svelte            # created by `brixter init`; imports brixter/styles.css
    [...path]/+page.svelte
```

Admin styles ship in `brixter/styles.css` and scope theme tokens to
`.brixter-root`, so they do not override your site's palette or toggle dark
mode on `document.body`.

Your host app needs:

- `@tailwindcss/vite` in `vite.config` (before `sveltekit()`)
- `@import 'tailwindcss'` in your own global stylesheet (for site pages)
- `src/routes/__brixter/+layout.svelte` importing `brixter/styles.css` (created
  by `brixter init`)

Import `brixter/styles.css` from the `__brixter` layout, not your root layout.
That file carries Brixter's Tailwind `@source` entries, font faces, utilities
(`font-brand`, `font-display`, `text-heading`, `btn-brutal`, accent colors),
and warm gray tokens for the admin UI.

Upgrade to **0.0.5** or later if fonts or accent colors look wrong — earlier
0.0.4 builds did not run Brixter CSS through Tailwind correctly.

## Explorer

The dashboard explorer is SvelteKit-first: it starts from the app's
`src/routes` directory and shows route pages instead of arbitrary repository
folders. If the SvelteKit app lives below the repository root, Brixter infers
that from Vite's `root` and uses a repo-relative routes root such as
`site/src/routes`.

You can override discovery explicitly:

```ts
brixter({ appRoot: 'site' });
// or
brixter({ routesRoot: 'site/src/routes' });
```

## `.brix.yaml` Pages

Brixter's Vite plugin compiles `.brix.yaml` and `.brix.yml` files into Svelte
pages. The generated component exports `metadata`, exposes valid metadata keys
such as `title` and `description` as local variables, renders components from
`$lib/brixter/brix`, and wraps content in a layout from
`$lib/brixter/layouts` when `layout` is set.

```yaml
title: About Us
description: Learn more about our team
layout: default

components:
  - type: hero
    props:
      heading: Welcome
      subtitle: We build great things
```

For SvelteKit route discovery, make sure the app's `svelte.config` includes:

```js
extensions: ['.svelte', '.brix.yaml', '.brix.yml'];
```

## Developing

Start a development server:

```sh
npm run dev
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## License

[MIT](./LICENSE)
