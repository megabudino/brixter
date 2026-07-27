# Brixter

**Your marketing site's content, as code.**

Brixter is a toolkit for building fast, SEO-ready marketing sites where the content lives in your repository — as plain, versioned files — instead of in a database or a third-party CMS.

Pages are declarative. Sections are reusable, visually-editable blocks called *briks*. There's no separate content store to keep in sync, no API to call at runtime, no vendor to lock into. What you commit is what you ship.

> Status: Brixter is young and moving fast. The APIs described here are stabilising toward `0.x`. Expect sharp edges.

---

## Why Brixter

Most marketing-site stacks force a choice: either a headless CMS (great for editors, but your content now lives somewhere else, behind an API, outside version control) or hand-written pages (fully in your repo, but no one on the marketing team can touch them).

Brixter refuses the trade-off. The content **is** the codebase:

- **Versioned by default.** Every page is a file. Edits are diffs. Changes go through the same review, branching, and rollback you already use for code.
- **No runtime dependency.** Pages compile to plain components at build time. There's no database call, no CMS fetch, nothing to be slow or go down between your site and its content.
- **Editable without lock-in.** Content is authored as human-readable YAML and annotated markup — writable by hand, or through a visual editor, with the file on disk always the single source of truth.
- **Built for marketing.** SEO (`<title>`, meta description, canonical, Open Graph, Twitter cards, JSON-LD), theming, and fast static output are first-class, not afterthoughts.

## Core concepts

**Brix** — a *brik* is a reusable section (a hero, a pricing table, a testimonial wall) authored as annotated HTML. Simple `data-brixter-*` attributes mark which parts are editable and which fields feed a repeating collection, so the same component renders on the site and drives the visual editor.

**Pages** — a page is a `.brix.yaml` file placed exactly where a route lives. It's a declarative list of briks with their props, plus page-level metadata:

```yaml
title: The content is in your codebase.
description: A visual CMS for marketing sites, versioned in your repo.
components:
  - type: Hero
    props:
      headline: Ship pages, not tickets.
      cta: { label: Get started, href: /docs }
  - type: Pricing
    props:
      plans: [ ... ]
```

That file compiles to a component with SEO metadata already wired into `<head>`. Its URL is simply where it sits in your routes — no slugs, no mapping table.

**Controllers** — because briks are pure markup (no `<script>`), any interactivity lives in vanilla JS/TS *controllers* under `$lib/brixter/controllers/`. Each file progressively enhances the rendered DOM by hooking onto `data-*` attributes, is auto-registered (adding a file registers it — no registry to edit), and runs client-side through `initBrixControllers`. See the [`brixter` package guide](./packages/brixter/README.md#controllers-progressive-enhancement).

**The engine is portable.** The heart of Brixter — the page format, parser, interpreter, and (de)serializers — lives in a dependency-free core with no framework ties. SvelteKit is the first integration, not a permanent commitment; the framework-specific layer is deliberately thin.

## Packages

This is a monorepo. Two packages are published:

| Package | What it is |
| --- | --- |
| [`@brixter/core`](./packages/core) | The framework-agnostic engine: page format, parser/interpreter, and YAML import/export. Zero UI, zero framework dependencies. |
| [`brixter`](./packages/brixter) | The SvelteKit integration: a Vite plugin that compiles `.brix.yaml` pages, plus SEO and theming primitives. |

The visual editor (**Brixter Editor**) is a separate application. It reads and writes the same files in your repo — it is not required to build or run a Brixter site, and it does not ship inside these packages.

**Agent-ready.** The `brixter` package ships guides for coding agents covering how
to author briks, pages and controllers. `npx brixter skills install` translates
them into whatever agents your team runs — Claude Code skills, Cursor rules,
Copilot instructions, `AGENTS.md` — from one source. See the
[package guide](./packages/brixter/README.md#agent-skills).

## Getting started

You'll need an existing SvelteKit app. See the [`brixter` package guide](./packages/brixter/README.md) for installing the Vite plugin, registering the `.brix.yaml` extension, and authoring your first brik.

## Contributing

Issues and pull requests are welcome. The codebase is Bun-based (`bun install` at the root); packages are tested with Vitest.

### Releasing

Releases are driven by git tags on the `brixter` version. From the repo root:

```sh
# Bump brixter (tag uses the brixter version)
npm run release:brixter:patch
```

The script bumps `packages/brixter/package.json`, commits, tags `v<brixter-version>`, and pushes. The `Publish to npm` GitHub Actions workflow then publishes `brixter` to npm, skipping it if that version is already published. Replace `patch` with `minor` or `major` as needed.

Dry-run tarball (no publish): `npm run pack:brixter`.

## License

[MIT](./LICENSE)
