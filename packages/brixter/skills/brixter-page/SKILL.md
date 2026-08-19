---
name: brixter-page
description: Author or edit a `+page.md` — routing, the `brix` list and its props, the `metadata` block that drives `<head>` (title, description, canonical, robots, Open Graph, Twitter, JSON-LD), the markdown body handed to the layout, per-page sitemap control, and redirects from old URLs via `aliases`. Use when adding a page to a Brixter site, changing the sections on one, redirecting a URL that moved, or editing any `+page.md` file.
---

# Authoring a page

A page is a `+page.md` file placed exactly where a `+page.svelte` would go.
**Its URL is its location in `src/routes`** — no slugs, no mapping table.

```
src/routes/+page.md                     →  /
src/routes/pricing/+page.md             →  /pricing
src/routes/(marketing)/about/+page.md   →  /about
```

The file is YAML frontmatter followed by a markdown body:

```markdown
---
metadata:
  title: Pricing — Brixter
  description: Simple per-seat pricing. No content API, no vendor lock-in.
layout: Marketing
brix:
  - type: Hero
    props:
      headline: Ship pages, not tickets.
      cta:
        label: Get started
        href: /docs
  - type: Pricing
    props:
      plans: [...]
---

## Frequently asked

The body is ordinary markdown. It is compiled to HTML and handed to the layout
as `content`.
```

The frontmatter's top level is a **closed set of five keys** — `metadata`,
`brix`, `layout`, `aliases`, `sitemap`. Anything else is an error, so a
misspelled `titel:` is caught rather than quietly becoming a metadata key that
renders nothing.

## `brix`

An ordered list — it _is_ the vertical order of the page. Each entry is:

- `type` — the brik's file name without extension. `Hero` resolves to
  `$lib/brixter/brix/Hero.brix` (falling back to `Hero.svelte`).
- `props` — the values for that brik's props.

Props must match what the brik's template reads, and **the build checks that they
do**. Before writing props, open the brik: every `{ … }` in it is a prop, and its
annotations are the contract.

| In the brik                                       | In the page                                      |
| ------------------------------------------------- | ------------------------------------------------ |
| `{headline}`                                      | `headline: …`                                    |
| `{cta.label}` and `href={cta.href}`               | `cta: { label: …, href: … }`                     |
| `{#each reviews as review}` with `{review.quote}` | `reviews: [{ quote: …, author: … }]`             |
| `{@image screenshot}`                             | `screenshot: /images/app.png`                    |
| `{@icon feature.icon}`                            | `icon: "<svg …>…</svg>"` (inline SVG string)     |
| `{@enum('yellow','blue') accent}`                 | `accent: yellow` — anything else fails the build |
| `{@required headline}`                            | `headline` must be present                       |

Get one wrong and the build stops with the file, the line and the path of the
field at fault. `npx brixter check` gives the same answers without a build.

Notes on values:

- **Richtext props** (`{@richtext …}`) accept an HTML string:
  `headline: Ship <em>pages</em>, not tickets.` Quote the scalar when it starts
  with a character YAML treats specially.
- **Icons and long SVG** read best as YAML block scalars (`icon: |`).
- **Omit a prop to accept its placeholder.** A brik's `??` values are its
  defaults; a page only has to say what differs.
- **The same brik can appear more than once** with different props. That is the
  normal way to build a page — reuse over new files.

## The markdown body

Everything after the closing `---` is markdown. It is compiled to HTML and passed
to the layout as `content`:

```svelte
<!-- $lib/brixter/layouts/Marketing.svelte -->
<script>
	let { metadata, content, children } = $props();
</script>

{@render children()}

{#if content}
	<article class="prose">{@html content}</article>
{/if}
```

With no layout, the body renders after the sections. Use it for editorial copy
that does not deserve a brik of its own — an FAQ, a changelog entry, the long
half of a documentation page.

## `metadata` — everything that reaches `<head>`

```yaml
metadata:
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

Keys beyond these are allowed and reach the layout untouched, which is how a
layout takes a per-page setting of its own. Every page should carry at least
`title` and `description`. Injection can be disabled globally with
`brixter({ seo: false })`.

## `layout`

```yaml
layout: Marketing
```

Wraps the page in `$lib/brixter/layouts/Marketing.svelte`, which receives
`metadata`, `content`, and the briks as `children`. Omit the key to use the
plugin's `defaultLayout`, if configured.

## `sitemap`

`brixter/sveltekit/sitemap` discovers every page under `src/routes` — no list to
maintain. Per-page control sits at the top level of the frontmatter:

```yaml
metadata:
  robots: noindex # excluded from the sitemap
sitemap: false # excluded
sitemap: # or override individual fields
  changefreq: weekly
  priority: 0.8
  lastmod: 2026-01-15
  loc: https://example.com/pricing
```

Route groups like `(marketing)` are collapsed; dynamic `[slug]` routes are
skipped from the automatic set and fed via `additionalPaths` in
`createSitemap()`.

## `aliases` — redirects

When this page replaces an old URL, the page owns the redirect. List the old
paths in `aliases`:

```yaml
aliases:
  - /plans # 301, the default
  - path: /black-friday # long form, when the status matters
    status: 302
```

Every alias on the site is compiled at build time into one map, emitted in the
adapter's native format and served by the hosting layer with a real status code.
Keep the declaration on the page that answers for the old URL — deleting the page
deletes its redirects.

The build **fails** if an alias shadows a path the site already serves, if two
pages claim the same alias, or if the aliases form a cycle. A page on a dynamic
`[slug]` route can't declare aliases: it has no single destination.

## Workflow

1. Create the file at the path that _is_ the URL.
2. Write `metadata.title` and `metadata.description` first.
3. List the sections in `brix`, in visual order, reusing existing briks — check
   `$lib/brixter/brix/` before assuming a new one is needed.
4. For each entry, open the brik and fill props against what its template reads.
   Omit anything whose `??` placeholder is already right.
5. Add editorial prose under the frontmatter if the page needs it.
6. Add `og` / `twitter` / `jsonLd` if the page is a share target.
7. Run `npx brixter check`, then load the route in the dev server.

If a section needs markup no existing brik provides, author the brik first — see
the `brixter-brik` skill — then reference it here.
