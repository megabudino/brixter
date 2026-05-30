# brixter

Brixter CMS package for SvelteKit apps.

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
`playground/src/routes`.

You can override discovery explicitly:

```ts
brixter({ appRoot: 'playground' });
// or
brixter({ routesRoot: 'playground/src/routes' });
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
