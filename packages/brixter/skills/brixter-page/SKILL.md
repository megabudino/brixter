---
name: brixter-page
description: Author or edit a `.brix.yaml` page — routing, the `components` list and its props, page metadata, SEO tags (title, description, canonical, robots, Open Graph, Twitter, JSON-LD), and per-page sitemap control. Use when adding a page to a Brixter site, changing the sections on one, or editing any `.brix.yaml` / `.brix.yml` file.
---

# Authoring a page

A page is a `+page.brix.yaml` file placed exactly where a `+page.svelte` would
go. **Its URL is its location in `src/routes`** — no slugs, no mapping table.

```
src/routes/+page.brix.yaml           →  /
src/routes/pricing/+page.brix.yaml   →  /pricing
src/routes/(marketing)/about/+page.brix.yaml  →  /about
```

The file is a YAML document with one special key — `components` — plus `layout`,
plus page **metadata**. Everything that is not `components` or `layout` is
metadata, and metadata drives `<head>`.

```yaml
# src/routes/+page.brix.yaml
title: The content is in your codebase.
description: A visual CMS for marketing sites, versioned in your repo.
components:
  - type: Hero
    props:
      eyebrow: Brixter
      headline: Ship pages, not tickets.
      subtitle: Landing pages editable in preview. Code stays in the repo.
      cta:
        label: Get started
        href: /docs
  - type: Pricing
    props:
      plans: [...]
```

## `components`

An ordered list — it _is_ the vertical order of the page. Each entry is:

- `type` — the brik's file name without extension. `Hero` resolves to
  `$lib/brixter/brix/Hero.brix` (falling back to `Hero.svelte`).
- `props` — the values for that brik's fields.

Props must match the paths the brik annotates. Before writing props, **open the
brik** and read its `data-brixter-field` / `data-brixter-bind` /
`data-brixter-collection-item` attributes — those paths are the contract:

| In the brik                                                             | In the page                                  |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| `data-brixter-field="headline"`                                         | `headline: …`                                |
| `data-brixter-field="cta.label"` + `data-brixter-bind="href: cta.href"` | `cta: { label: …, href: … }`                 |
| `data-brixter-collection-item="reviews"` with `reviews[].quote`         | `reviews: [{ quote: …, author: … }]`         |
| `data-brixter-field="screenshot:image"`                                 | `screenshot: /images/app.png`                |
| `data-brixter-field="icon"` with kind `icon`                            | `icon: "<svg …>…</svg>"` (inline SVG string) |

A prop the brik doesn't annotate is silently ignored; a field the page omits
renders empty (unless the brik's frontmatter gives it a `default`). Both fail
quietly — check the paths.

Notes on values:

- **Richtext fields** (`:richtext-inline` / `:richtext-block`) accept an HTML
  string: `headline: Ship <em>pages</em>, not tickets.` Quote the scalar when it
  starts with a character YAML treats specially.
- **Icons and long SVG** read best as YAML block scalars (`icon: |`).
- **The same brik can appear more than once** with different props. That is the
  normal way to build a page — reuse over new files.

## Metadata and SEO

Top-level keys other than `components` / `layout` become the page metadata,
exported as `metadata` and rendered into `<head>` by `<BrixSeo>`:

```yaml
title: Pricing — Brixter
description: Simple per-seat pricing. No content API, no vendor lock-in.
canonical: /pricing
robots: index,follow
og:
  title: Brixter pricing
  description: Simple per-seat pricing.
  image: /og/pricing.png
  type: website
twitter:
  card: summary_large_image
  title: Brixter pricing
  image: /og/pricing.png
jsonLd:
  '@context': https://schema.org
  '@type': Product
  name: Brixter
components: [...]
```

| Field         | Renders                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `title`       | `<title>`                                                                              |
| `description` | `<meta name="description">`                                                            |
| `canonical`   | `<link rel="canonical">`                                                               |
| `robots`      | `<meta name="robots">` — `index,follow`, `noindex`, `noindex,nofollow`, …              |
| `og`          | Open Graph — `og.title`, `og.description`, `og.image`, `og.url`, `og.type`             |
| `twitter`     | Twitter Card — `twitter.card`, `twitter.title`, `twitter.description`, `twitter.image` |
| `jsonLd`      | One or more `<script type="application/ld+json">` blocks                               |

Root-relative URLs in `canonical`, `og.image`, `og.url` and `twitter.image` are
absolutised against the request origin, since social crawlers don't resolve
relative paths — so write them root-relative and let the runtime do it. Under
`adapter-node` the origin comes from the `ORIGIN` env var.

Every page should carry at least `title` and `description`. Injection can be
disabled globally with `brixter({ seo: false })`.

## `layout`

```yaml
layout: Marketing
```

Wraps the page in `$lib/brixter/layouts/Marketing.svelte`. The layout receives
the metadata both as a `metadata` prop and spread as individual props. Omit the
key to use the plugin's `defaultLayout`, if configured.

## Sitemap

`brixter/sveltekit/sitemap` discovers every page under `src/routes` — no list to
maintain. Per-page control lives in the page's own metadata:

```yaml
robots: noindex          # excluded from the sitemap
sitemap: false           # excluded
sitemap:                 # or override individual fields
  changefreq: weekly
  priority: 0.8
  lastmod: 2026-01-15
  loc: https://example.com/pricing
```

Route groups like `(marketing)` are collapsed; dynamic `[slug]` routes are
skipped from the automatic set and fed via `additionalPaths` in
`createSitemap()`.

## Workflow

1. Create the file at the path that _is_ the URL.
2. Write `title` and `description` first.
3. List the sections in `components`, in visual order, reusing existing briks —
   check `$lib/brixter/brix/` before assuming a new one is needed.
4. For each entry, open the brik and fill props against its annotated paths.
5. Add `og` / `twitter` / `jsonLd` if the page is a share target.
6. Load the route in the dev server to confirm it renders.

If a section needs markup no existing brik provides, author the brik first — see
the `brixter-brik` skill — then reference it here.
