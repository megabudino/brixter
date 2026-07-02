# Brixter

SvelteKit CMS with a visual builder, `.brix.yaml` pages, and a dashboard for routes, media, and publishing.

> **Adding Brixter to your project?** Follow the [configuration guide →](./packages/brixter/README.md)

## Packages

| Package | Description |
| --- | --- |
| [`brixter`](./packages/brixter) | Main CMS library and `brixter` CLI for SvelteKit apps |

See each package README for install and usage.

### Releasing

Releases are driven by git tags on the `brixter` version. From the repo root:

```sh
# Bump brixter (tag uses the brixter version)
npm run release:brixter:patch
```

The script bumps `packages/brixter/package.json`, commits, tags `v<brixter-version>`, and pushes. The `Publish to npm` GitHub Actions workflow then publishes `brixter` to npm, skipping it if that version is already published.

Replace `patch` with `minor` or `major` as needed.

Dry-run tarball (no publish):

```sh
npm run pack:brixter
```

## License

[MIT](./LICENSE)
