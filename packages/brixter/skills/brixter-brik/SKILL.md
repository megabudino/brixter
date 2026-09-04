---
name: brixter-brik
description: Author or edit a `.brix` file — the template of a reusable Brixter section, including `{interpolation}`, `{#each}`, `{#if}`, the `@tag` annotations that type a prop, and the `??` fallback that doubles as its editor placeholder. Use when creating a new section for a Brixter site, or when editing any file with the `.brix` extension.
---

# Authoring a brik

A _brik_ is one reusable section of a page — a hero, a pricing table, a
testimonial wall — living in `$lib/brixter/brix/<Name>.brix`. A page references
it by file name: `Hero.brix` → `type: Hero`.

A `.brix` file is **HTML with braces**: plain markup where `{ … }` marks what a
page supplies. The same braces serve two consumers — the site renderer
substitutes values into them, and the visual editor derives from them what is
editable.

**There is no schema to write.** The props a brik accepts, their types, their
defaults and their editor labels are all read back out of the template. If it is
not in the markup, it is not a prop.

**A `.brix` file has no `<script>` and no framework syntax** — no event handlers,
no imports, no arbitrary JavaScript. Interactivity goes in a controller (see the
`brixter-controller` skill).

## File shape

```brix
---
title: Hero
description: Primary hero with promise, subtitle, and CTA.
---

<section class="bg-gray-50 px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-2xl text-center">
		<p class="text-muted text-[11px] uppercase">{eyebrow ?? 'Eyebrow'}</p>

		<h1 class="font-display text-heading text-4xl">
			{@richtext @required headline}
		</h1>

		<a href={cta.href ?? '#'} class="btn-site-primary">{cta.label ?? 'Get started'}</a>

		<img src={@image screenshot} alt="" class="mt-12 w-full" />
	</div>
</section>
```

The frontmatter carries **only the brik's own identity** — `title` and
`description`, both optional, shown when picking a brik in the editor. Any other
key is an error: everything about the props belongs next to the props.

## Interpolation

`{path}` puts a value where it is written, HTML-escaped. Dot paths work
(`cta.label`). It works in element content and in attribute values alike:

```brix
<p>{eyebrow}</p>
<p>Hi {name}, welcome.</p>
<a href={cta.href}>Go</a>
<div class="card {accent}">…</div>
```

Two attribute rules worth knowing:

- An attribute whose value is a **lone** interpolation disappears entirely when
  the value is absent or `false`. That is how `data-featured={plan.featured}`
  ends up on featured plans only. A `true` is written as `="true"`, so
  attribute-value selectors like Tailwind's `data-[featured=true]:` match.
- Inside `style`, a declaration whose interpolation is empty is dropped and the
  others stand: `style="object-fit: cover; object-position: {position};"` keeps
  `object-fit` when no `position` is given. Interpolated style values are
  sanitised, so a page can never inject extra declarations.

## `??` — the default _and_ the placeholder

```brix
<p>{eyebrow ?? 'Pricing'}</p>
```

The value after `??` is used when the page omits the prop, when it is null, and
when it is an empty string. That makes it the placeholder the editor shows
before content exists, which is why briks carry no separate defaults block.
**Write realistic placeholders** — real-length sentences, not "Lorem" or
"Title 1".

Do not write a `??` on a collection. An unpopulated collection is filled with
placeholder entries built from the `??` values of the fields inside it.

## `@tag` annotations

Any interpolation may carry annotations before its path:
`{@richtext @required headline ?? 'Ship pages'}`. All of them are optional.

### Type

Most types are inferred from how a prop is used. Annotate when the use is not
enough — and always for `@richtext`, `@icon` and `@enum`.

| Tag                                           | Meaning                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@richtext`                                   | The value is raw HTML — one line that may carry `<em>`, `<strong>`, a link, or several paragraphs. |
| `@icon`                                       | Raw HTML: the value is an inline `<svg>` string.                                                   |
| `@image`                                      | An image URL. Also inferred from `src`, `srcset` and `poster`.                                     |
| `@url`                                        | A link. Also inferred from `href` and `action`.                                                    |
| `@number` `@boolean` `@date` `@color` `@json` | Fix the type when nothing else implies it.                                                         |
| `@enum('a','b','c')`                          | A closed set of values. Nothing can infer this — always write it.                                  |

**Escaping.** Only `@richtext` and `@icon` emit markup from content, and their
values are treated as semi-trusted and are not sanitised. Leave a prop plain
unless it genuinely needs formatting.

What is inferred without you: `{#each xs as x}` makes `xs` a collection, any
`x.field` inside it shapes the entry, `{cta.label}` makes `cta` an object, and a
prop only ever tested by `{#if}` is a boolean.

### Constraints

| Tag                     | Meaning                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `@required`             | The page must supply this prop. The build fails if it does not.     |
| `@min(n)` `@max(n)`     | Bounds: a number's value, a collection's length, a string's length. |
| `@pattern('^[a-z-]+$')` | A regular expression the string must match.                         |

`@required` and `??` contradict each other — a required prop has nothing to fall
back to — and writing both is an error.

### Editor

`@label('Button link')` sets the field's label in the editor. Without it the key
is humanised (`ctaHref` → "Cta href"), which is usually enough.

### Props the markup never renders

A value read only by a controller still has to be declared, or a page passing it
is reported as an unknown prop:

```brix
{@prop @boolean autoplay ?? false}
```

It renders nothing. Its type cannot be inferred, so annotate it.

## `{#each}` — collections

```brix
<div class="mt-12 grid gap-4 md:grid-cols-3">
	{#each reviews as review}
		<figure class="border p-6">
			<blockquote>{@richtext review.quote ?? 'I can finally update a landing page.'}</blockquote>
			<figcaption>
				<p>{review.author ?? 'Marketing Lead'}</p>
				<p>{review.role ?? 'Growth team'}</p>
			</figcaption>
		</figure>
	{/each}
</div>
```

Write **exactly one** entry — it is the template and the placeholder both. Do not
hand-write three copies to fake a grid; the grid comes from the wrapper's
classes, the repetition from the data.

`{#each xs as x, i}` binds the index as well. The index is not a prop.

Collections **nest**: `{#each plans as plan}{#each plan.tiers as tier}` works,
and each alias is scoped to its own block.

## `{#if}` — conditionals

```brix
{#if plan.badge}<p class="badge">{plan.badge}</p>{/if}

{#if plan.tier == 'pro'}Pro{:else if plan.tier == 'max'}Max{:else}Free{/if}
```

Conditions take a path, `!` to negate, and a comparison against a literal
(`== != > < >= <=`). An empty collection is falsy. Comparisons are only allowed
inside `{#if}` — everywhere else an expression is a path with annotations.

## Checklist before finishing a brik

1. **No `<script>`**, no event handlers, no JavaScript beyond the small
   expression grammar above.
2. Every piece of copy a page should own is an interpolation; everything
   structural stays hardcoded.
3. Every interpolation has a **realistic `??` placeholder**, unless it is
   `@required`.
4. `@richtext`, `@icon` and `@enum` are annotated — nothing can infer them.
5. Collections have exactly one entry written in the markup.
6. Tailwind classes pair each light utility with its `dark:` variant, and reuse
   the theme tokens (`text-heading`, `text-secondary`, `text-muted`,
   `font-display`, `btn-site-primary`) rather than ad-hoc colours.
7. The file name is `PascalCase.brix` and names what the section _is_.
8. `npx brixter check` passes.
