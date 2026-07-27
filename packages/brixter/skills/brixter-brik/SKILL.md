---
name: brixter-brik
description: Author or edit a `.brix` file — the annotated HTML of a reusable Brixter section, including `data-brixter-field` / `-bind` / `-collection-item` annotations, field kinds, and the frontmatter field schema. Use when creating a new section for a Brixter site, or when editing any file with the `.brix` extension.
---

# Authoring a brik

A _brik_ is one reusable section of a page — a hero, a pricing table, a
testimonial wall — living in `$lib/brixter/brix/<Name>.brix`. A page references
it by file name: `Hero.brix` → `type: Hero`.

A `.brix` file is **annotated HTML**: plain markup where `data-brixter-*`
attributes mark which parts are driven by page props. The same annotations serve
two consumers — the site renderer substitutes values into them, and the visual
editor uses them to know what is editable. Write markup that reads well with the
placeholder content still in it.

**A `.brix` file has no `<script>` and no framework syntax** — no `{#if}`, no
`{expr}`, no event handlers. Interactivity goes in a controller (see the
`brixter-controller` skill).

## File shape

```html
---
description: Primary hero with promise, subtitle, and CTA.
fields:
  cta:
    fields:
      href:
        default: '#'
---

<section class="relative overflow-hidden bg-gray-50 px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-2xl text-center">
		<p class="text-muted mb-3 text-[11px] uppercase" data-brixter-field="eyebrow">Eyebrow</p>
		<h1 class="font-display text-heading text-4xl" data-brixter-field="headline:richtext-inline">
			Headline goes here.
		</h1>
		<a
			href="#"
			class="btn-site-primary"
			data-brixter-field="cta.label"
			data-brixter-bind="href:cta.href"
			>Get started</a
		>
		<img src="" alt="" class="mt-12 w-full" data-brixter-field="screenshot:image" />
	</div>
</section>
```

The optional `--- … ---` frontmatter is **not rendered**. Everything after it is
the template.

## The four annotations

### `data-brixter-field="path"` — bind element content

Replaces the element's children with the resolved prop value. Dot paths work
(`cta.label`). A missing value renders empty, dropping the placeholder.

Attach the **kind** as a suffix after the last `:` — this compact form is
preferred:

```html
<h1 data-brixter-field="headline:richtext-inline">Headline goes here.</h1>
```

| Kind              | Effect on render                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `text`            | Value is HTML-escaped into the element. **Default** for every element except `<img>`.           |
| `richtext-inline` | Value is injected as **raw HTML**. For a single line that may carry `<em>`, `<strong>`, a link. |
| `richtext-block`  | Raw HTML, for multi-paragraph prose.                                                            |
| `icon`            | Raw HTML — the value is an inline `<svg>` string.                                               |
| `image`           | Sets the element's `src` and drops its children. **Default** for `<img>`.                       |

Two rules follow from that table:

- **Escaping.** Only the raw-HTML kinds (`richtext-*`, `icon`) can emit markup
  from content. Use `text` unless the field genuinely needs formatting —
  richtext content is treated as semi-trusted and is not sanitised.
- **`<img>`.** `data-brixter-field="screenshot"` on an `<img>` already means
  `image`; the explicit `:image` suffix is clearer but not required. Keep
  `src=""` in the static markup as the placeholder.

The older two-attribute form still works and is equivalent, but prefer the
suffix in new markup:

```html
<h1 data-brixter-field="headline" data-brixter-kind="richtext-inline">…</h1>
```

Precedence when both are present: the `path:kind` suffix wins.

### `data-brixter-bind="attr: path; …"` — bind attributes

A `;`-separated list of `target: path` pairs. Independent of
`data-brixter-field`; an element can use both. The **first** `:` of each pair
splits target from path.

```html
<a href="#" data-brixter-field="cta.label" data-brixter-bind="href: cta.href; target: cta.target">
	Get started
</a>
```

Two kinds of target:

| Target               | Effect                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attr: path`         | Replaces the **whole** attribute value — any attribute, including all of `style` or `class`.                                                                                     |
| `style.<prop>: path` | Merges a **single** CSS declaration into the existing `style`, keeping the other declarations. `<prop>` may be a CSS property (`object-position`) or a custom property (`--op`). |

`style.<prop>` is how you let a page override one visual detail without giving
away the whole style attribute:

```html
<img
	style="object-position: 50% 50%;"
	data-brixter-field="imageSrc"
	data-brixter-bind="alt: imageAlt; style.object-position: imagePosition"
/>
```

- A `null`/empty value emits no declaration and does **not** remove the static
  one — the markup default stands. Rely on this instead of duplicating defaults.
- Multiple `style.*` targets accumulate; a whole-attribute `style:` replace is
  applied first, then the per-property merges compose onto its result.
- Values are sanitised (`;`, `{`, `}`, `<`, `>` dropped) so a page value can
  never inject extra declarations. Quotes and parens survive, so `url("…")` works.

### `data-brixter-collection-item="items"` — repeat an element

Put it on the element that should repeat once per entry of the array prop.
Inside it, fields address the current entry with `items[].<key>`:

```html
<div class="mt-12 grid gap-4 md:grid-cols-3">
	<figure class="border p-6" data-brixter-collection-item="reviews">
		<blockquote data-brixter-field="reviews[].quote:richtext-inline">
			I can finally update a landing page without opening an issue.
		</blockquote>
		<figcaption>
			<p data-brixter-field="reviews[].author">Marketing Lead</p>
			<p data-brixter-field="reviews[].role">Growth team</p>
		</figcaption>
	</figure>
</div>
```

Write **exactly one** item in the markup — it is the template _and_ the
placeholder. Do not hand-write three copies to fake a grid; the grid comes from
the wrapper's classes, the repetition from the data.

`data-brixter-bind` also resolves `items[].x` inside a collection item:

```html
<li data-brixter-collection-item="items" data-brixter-bind="data-href: items[].url"></li>
```

**Limitation — no nested collections.** The array named by
`data-brixter-collection-item` is always resolved from the page props root, so a
collection cannot repeat _inside_ another collection's item. Model
two-level content as a flat list, or as separate sibling collections.

## Frontmatter: `description` and `fields`

Field config is **inferred from the markup** — you only need frontmatter to add
what markup cannot express. Keep it minimal.

```yaml
---
description: Reviews and social proof section.
fields:
  reviews:
    label: Reviews
    itemLabel: Review
    summaryField: author
  cta:
    fields:
      href:
        default: '#'
---
```

`description` is a one-line summary of the section, shown when picking a brik.

Under `fields`, each key mirrors a field path (nesting via `fields:`), and takes:

| Key            | Purpose                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`        | Human label in the editor. Defaults to a humanised key.                                                                                              |
| `description`  | Help text for the editor.                                                                                                                            |
| `default`      | Value used when a page omits the prop.                                                                                                               |
| `kind`         | Override the inferred kind — see the table above, plus `boolean`, `number`, `object`, `array`, `select`, `url`, `textarea`, `date`, `color`, `json`. |
| `options`      | For `kind: select` — a list of `{ label, value }`.                                                                                                   |
| `fields`       | Nested config for an object field.                                                                                                                   |
| `item`         | Field config applied to each entry of an array field.                                                                                                |
| `itemLabel`    | Singular label for a collection entry ("Review").                                                                                                    |
| `summaryField` | Which key of an entry to show as its title in the editor list.                                                                                       |
| `imageField`   | Which key of an entry to show as its thumbnail.                                                                                                      |

For a collection, `itemLabel` + `summaryField` are the two that most improve the
editing experience — set them whenever you add a collection.

## Checklist before finishing a brik

1. **No `<script>`**, no Svelte syntax, no inline event handlers.
2. Every piece of copy a page should own is a `data-brixter-field`; everything
   structural stays hardcoded.
3. Placeholder content is **realistic** — real-length sentences, not "Lorem" or
   "Title 1". Placeholders are what the editor shows before content exists.
4. Collections have exactly one item element in the markup.
5. `text` is used unless the field really needs formatting.
6. Tailwind classes pair each light utility with its `dark:` variant, and reuse
   the theme tokens (`text-heading`, `text-secondary`, `text-muted`,
   `font-display`, `btn-site-primary`) rather than ad-hoc colours.
7. The file name is `PascalCase.brix` and names what the section _is_.
