# Brixter

**Your marketing site's content, as code.**

Brixter is a toolkit for building fast, SEO-ready marketing sites where the content lives in your repository — as plain, versioned files — instead of in a database or a third-party CMS.

Pages are declarative. Sections are reusable, visually-editable blocks called _briks_. There's no separate content store to keep in sync, no API to call at runtime, no vendor to lock into. What you commit is what you ship.

> Status: Brixter is young and moving fast. The APIs described here are stabilising toward `0.x`. Expect sharp edges.

---

## Why Brixter

Most marketing-site stacks force a choice: either a headless CMS (great for editors, but your content now lives somewhere else, behind an API, outside version control) or hand-written pages (fully in your repo, but no one on the marketing team can touch them).

Brixter refuses the trade-off. The content **is** the codebase:

- **Versioned by default.** Every page is a file. Edits are diffs. Changes go through the same review, branching, and rollback you already use for code.
- **No runtime dependency.** Pages compile to plain components at build time. There's no database call, no CMS fetch, nothing to be slow or go down between your site and its content.
- **Editable without lock-in.** Content is authored as markdown with YAML frontmatter — writable by hand, or through a visual editor, with the file on disk always the single source of truth.
- **Checked, not hoped for.** A page's sections are validated against the briks they use at build time. A misspelled prop, a missing required one, a value outside its allowed set: the build stops and names the file, the line and the field.
- **Built for marketing.** SEO (`<title>`, meta description, canonical, Open Graph, Twitter cards, JSON-LD), theming, and fast static output are first-class, not afterthoughts. When a page replaces an old URL it says so, in an `aliases` field; the build compiles every alias on the site into real redirects served by your hosting layer, and refuses to ship one that collides, points nowhere or loops.

## Core concepts

**Brix** — a _brik_ is a reusable section (a hero, a pricing table, a testimonial wall) authored as HTML with braces. `{ … }` marks what a page supplies; `@tag` annotations say what kind of value it is; `??` gives the fallback, which doubles as the placeholder the editor shows before content exists:

```brix
---
title: Pricing
description: Plans side by side, one card per plan.
---
<h2>{@richtext @required headline}</h2>

{#each plans as plan}
  <article data-accent={@enum('yellow','blue') plan.accent ?? 'yellow'}>
    <h3>{plan.name}</h3>
    <a href={plan.ctaHref ?? '#'}>{plan.ctaLabel ?? 'Get started'}</a>
  </article>
{/each}
```

**There is no schema to write.** The props a brik accepts, their types, their defaults and their editor labels are all derived from the markup that uses them — so nothing can drift out of sync with it, and the same derivation drives page validation, the visual editor, and generated TypeScript types.

**Pages** — a page is a `+page.md` file placed exactly where a route lives. Its frontmatter is a list of briks with their props, plus the metadata that reaches `<head>`; its body is markdown:

```markdown
---
metadata:
  title: The content is in your codebase.
  description: A visual CMS for marketing sites, versioned in your repo.
layout: Marketing
brix:
  - type: Hero
    props:
      headline: Ship pages, not tickets.
      cta: { label: Get started, href: /docs }
  - type: Pricing
    props:
      plans: [...]
---

Prose, when the page wants some. It is compiled to HTML and handed to the layout
as `content`, so editorial copy needs no brik of its own.
```

That file compiles to a component with SEO metadata already wired into `<head>`. Its URL is simply where it sits in your routes — no slugs, no mapping table.

**Controllers** — because briks carry no `<script>`, any interactivity lives in vanilla JS/TS _controllers_ under `$lib/brixter/controllers/`. Each file progressively enhances the rendered DOM by hooking onto `data-*` attributes, is auto-registered (adding a file registers it — no registry to edit), and runs client-side through `initBrixControllers`. See the [`brixter` package guide](./packages/brixter/README.md#controllers-progressive-enhancement).

**The engine is portable.** The heart of Brixter — the template language, the page format, the schema analyzer, and the validator — lives in a core with no framework ties and one dependency. SvelteKit is the first integration, not a permanent commitment; the framework-specific layer is deliberately thin.

## Packages

This is a monorepo. Two packages are published:

| Package                            | What it is                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@brixter/core`](./packages/core) | The framework-agnostic engine: the `.brix` template language, the `.md` page format, schema inference and validation. Zero UI, zero framework dependencies. |
| [`brixter`](./packages/brixter)    | The SvelteKit integration: a Vite plugin that compiles `+page.md` pages and validates them against their briks, plus SEO and theming primitives.            |

The visual editor (**Brixter Editor**) is a separate application. It reads and writes the same files in your repo — it is not required to build or run a Brixter site, and it does not ship inside these packages.

**Agent-ready.** The `brixter` package ships guides for coding agents covering how
to author briks, pages and controllers. `npx brixter skills install` translates
them into whatever agents your team runs — Claude Code skills, Cursor rules,
Copilot instructions, `AGENTS.md` — from one source. See the
[package guide](./packages/brixter/README.md#agent-skills).

## Getting started

You'll need an existing SvelteKit app. See the [`brixter` package guide](./packages/brixter/README.md) for installing the Vite plugin, registering the `.md` page extension, and authoring your first brik.

## Editor syntax highlighting

Briks are `.brix` files: a YAML frontmatter between `---` fences, then the template. [`tree-sitter-brix`](https://github.com/Brixter-Labs/tree-sitter-brix) is a deliberately minimal grammar that parses neither — it delimits the two regions and delegates them to the native YAML and HTML grammars via language injection. It does not yet know about the `{ … }` blocks introduced in 0.6. (Pages are `.md`, already covered by any editor.)

**Zed.** [`zed-brix-extension`](https://github.com/Brixter-Labs/zed-brix-extension) wires the grammar up. It isn't on the Zed registry, so install it as a dev extension: clone the repo, then `cmd-shift-p` → `zed: install dev extension` → pick the folder. Zed fetches and compiles the grammar to WebAssembly itself — no need to clone `tree-sitter-brix`. Extensions are per-user, so this is a one-time setup across all projects. For Tailwind autocomplete inside the injected HTML region, add to `settings.json`:

```json
{
	"languages": {
		"Brix": { "language_servers": ["tailwindcss-language-server"] }
	},
	"lsp": {
		"tailwindcss-language-server": {
			"settings": { "includeLanguages": { "Brix": "html" } }
		}
	}
}
```

**Other editors.** VS Code doesn't use Tree-sitter for third-party extensions, so the grammar doesn't help there. The fallback covers most of the file:

```json
"files.associations": { "*.brix": "html" }
```

The body highlights correctly and Tailwind works; the frontmatter stays plain text, without errors. Neovim can consume the grammar through nvim-treesitter's `install_info`, as manual config.

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
