# Brixter

SvelteKit CMS with a visual builder, `.brix.yaml` pages, and a dashboard for routes, media, and publishing.

## Packages

| Package | Description |
| --- | --- |
| [`brixter`](./packages/brixter) | Main CMS library and `brixter` CLI for SvelteKit apps |
| [`@brixter/brix-builder`](./packages/brix-builder) | Visual page builder used by the dashboard |

See each package README for install and usage.

### Publishing

From the repo root (after `npm login`):

```sh
npm run publish:packages
```

This publishes `@brixter/brix-builder` first, then unscoped `brixter`. Dry-run tarballs:

```sh
npm run pack:brix-builder
npm run pack:brixter
```

Link the unscoped `brixter` package to the [brixter npm org](https://www.npmjs.com/org/brixter) team after the first publish.

## License

[MIT](./LICENSE)
