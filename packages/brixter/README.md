# brixter

Brixter CMS package for SvelteKit apps.

## Install

```sh
npm install brixter
```

The visual page builder ships as a dependency ([`@brixter/brix-builder`](../brix-builder)); you normally do not install it separately.

## Init

After installing the package, wire the dashboard into a SvelteKit app:

```sh
brixter init
```

The init command creates the hidden `__brixter` route shims, wires SvelteKit
hooks, adds the Vite plugin, documents required environment variables, and adds
Tailwind sources for package components. It does not copy dashboard
implementation files into the app.

Useful options:

```sh
brixter init --dry-run
brixter init --cwd ./apps/web
brixter init --admin-path /admin
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
