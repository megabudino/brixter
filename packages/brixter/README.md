# brixter

Brixter CMS package for SvelteKit apps.

## Init

From your SvelteKit app directory, run:

```sh
npx brixter init
```

The init command adds `brixter` to `package.json` and runs your package manager,
creates the hidden `__brixter` route shims, wires SvelteKit hooks, adds the Vite
plugin, documents required environment variables in `.env.example`, creates
`.env` when missing, adds Tailwind sources for package components, and applies
Better Auth plus brixter SQL migrations to `DATABASE_URL`. It does not copy
dashboard implementation files into the app.

The visual page builder ships as a dependency of `brixter`
([`@brixter/brix-builder`](../brix-builder)); you normally do not install it
separately.

Useful options:

```sh
brixter init --dry-run
brixter init --cwd ./apps/web
brixter init --admin-path /admin
brixter init --skip-install
brixter init --skip-migrate
```

To re-run database migrations (Better Auth schema + brixter SQL):

```sh
npx brixter migrate
```

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
