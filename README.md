# Brixter

SvelteKit CMS with a visual builder, `.brix.yaml` pages, and a dashboard for routes, media, and publishing.

> **Adding Brixter to your project?** Follow the [configuration guide →](./packages/brixter/README.md)

## Packages

| Package | Description |
| --- | --- |
| [`brixter`](./packages/brixter) | Main CMS library and `brixter` CLI for SvelteKit apps |
| [`@brixter/brix-builder`](./packages/brix-builder) | Visual page builder used by the dashboard |

See each package README for install and usage.

### Releasing

Releases are driven by git tags on the `brixter` version. From the repo root:

```sh
# Bump only brixter (tag uses the brixter version)
npm run release:brixter:patch

# Bump both brixter and brix-builder together (tag uses the brixter version)
npm run release:all:patch
```

Each script bumps the relevant `package.json` versions, commits, tags `v<brixter-version>`, and pushes. The `Publish to npm` GitHub Actions workflow then publishes each package to npm individually, skipping any package whose version is already published.

Replace `patch` with `minor` or `major` as needed.

Dry-run tarballs (no publish):

```sh
npm run pack:brix-builder
npm run pack:brixter
```

## License

[MIT](./LICENSE)
