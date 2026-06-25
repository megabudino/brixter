# Vanilla-First Components

- Prefer components that stay as close as possible to plain Svelte components.
- Keep `<script module>` minimal and reserve it for metadata the builder cannot infer from markup.
- Prefer expressing editable targets in markup with `data-brixter-field` and `data-brixter-collection-item` instead of duplicating selectors in metadata.
- Keep builder metadata focused on real schema needs: `kind`, nested `fields`, `item`, defaults, and labels only when the key is not enough.
- Avoid verbose helper types or configuration when the component stays readable with straightforward `$props()` destructuring.
- If a builder feature can be derived reliably from existing markup or HTML attributes, prefer inference in the builder over per-component boilerplate.

# How to Create a `.brix.svelte` File

A `.brix.svelte` file is a Svelte 5 component that doubles as a builder-editable block (a "brik"). The preprocessor (`packages/brix-builder/svelte/preprocess.ts`) and adapter (`packages/brix-builder/svelte/adapter.ts`) infer most metadata from your markup annotations. You only add `<script module>` exports when the builder needs information it cannot derive from the HTML.

## File Location

Place `.brix.svelte` files under `site/src/lib/brixter/brix/`. The filename (e.g. `Hero.brix.svelte`) becomes the component type name (`Hero`).

## What Gets Auto-Inferred (No `<script module>` Needed)

You get **all of this for free** just from markup annotations:

1. **All field names and nesting** — parsed from `data-brixter-field` attributes (including dot-path nesting like `cta.label` and collection paths like `features[].title`).

2. **`$props()` destructuring** — the preprocessor injects `let { fieldName, ... } = $props()` automatically for every top-level field root.

3. **Field kinds** — `data-brixter-kind` on an element sets the kind explicitly. `<img>` tags are auto-detected as `kind: "image"`. Everything else defaults to `"text"`.

4. **Collection `{#each}` wrapping** — elements marked with `data-brixter-collection-item="collectionName"` are automatically wrapped in `{#each collectionName as item}` / `{/each}` at build time.

5. **Static markup defaults + Svelte expression replacement** — static text/element content is inferred as the field default, then replaced with `{fieldName}` (or `{@html fieldName ?? ''}` for richtext/icons).

6. **`data-brixter-bind` wiring** — `data-brixter-bind="href:cta.href"` rewrites the `href` attribute to `href={cta.href}` (useful for links, images, etc.).

7. **Schema export** — `export const brixterSchema = {...}` is auto-generated in `<script module>` from the markup-inferred fields.

## The One Mandatory Export

Always include `brikDescription` so the builder shows a human-readable label:

```svelte
<script module lang="ts">
  export const brikDescription = 'Primary hero with promise, subtitle, and CTA.';
</script>
```

## When You DO Need `<script module>` Metadata

Add `brikFields` only when the markup cannot express one of these:

| Situation | What to add |
|---|---|
| A **collection** (repeating items) | `label`, `itemLabel`, `summaryField`, and nested `item.fields` for any field that needs a non-inferrable `kind` or `default` |
| A field inside a **nested object** needs a `default` or explicit `kind` | Define the nested object's `fields` with that field's metadata |
| A field inside a **collection item** needs a `kind` (e.g. `icon`) or `default` | Define `item.fields` in the collection's `brikFields` entry |

The preprocessor **merges** markup-inferred fields with your `brikFields` export. You only need to provide the parts the markup cannot express. Everything else (structure, field names, nesting) comes from the HTML annotations.

## Field Annotation Reference

### `data-brixter-field` (required on every editable element)

Values follow dot-path + `[]` notation:

- **Simple field**: `"headline"` — a top-level text field
- **Nested field**: `"cta.label"` — a field inside a nested object called `cta`
- **Collection item field**: `"features[].title"` — the `title` field of each item in the `features` array
- **Nested inside a collection item**: `"sections[].cta.label"` — deep nesting works

### `data-brixter-kind` (optional, overrides auto-detection)

| Value | Effect |
|---|---|
| `"richtext-inline"` | Inline rich text (bold, italic, links). Renders with `{@html field ?? ''}` at build time. |
| `"richtext-block"` | Block rich text (paragraphs, headings). Same `{@html}` rendering. |
| `"icon"` | SVG icon picker. Renders with `{@html field ?? ''}`. |
| `"image"` | Image picker. Auto-detected on `<img>` elements. |
| `"text"`, `"boolean"`, `"number"` | Explicit scalar kinds if needed. |

If omitted: `<img>` → `"image"`, everything else → `"text"`.

### `data-brixter-collection-item` (marks repeating containers)

Put this on the element that wraps **one item** of a collection. The preprocessor wraps it in `{#each}`:

```svelte
<div data-brixter-collection-item="features">
  <!-- This whole block repeats for each item in `features` -->
  <h3 data-brixter-field="features[].title">Title</h3>
</div>
```

At build time this becomes:

```svelte
{#each features as feature}
  <div>
    <h3>{feature.title}</h3>
  </div>
{/each}
```

### `data-brixter-bind` (wires HTML attributes to field paths)

Format: `"htmlAttr:field.path"`. Multiple bindings separated by `;`:

```svelte
<a
  href="#"
  data-brixter-field="cta.label"
  data-brixter-bind="href:cta.href"
>
  Click here
</a>
```

At build time this becomes `<a href={cta.href}>{cta.label}</a>`.

### `data-brixter-label` and `data-brixter-preview-label` (optional)

Set custom labels for the inspector or preview interactions:

```svelte
<h2 data-brixter-field="headline" data-brixter-label="Main Heading" data-brixter-preview-label="Edit heading">
  Headline
</h2>
```

## Complete Examples

### Example 1: Simplest Possible Brik (No `<script module>` Metadata)

All fields are inferred from markup:

```svelte
<script module lang="ts">
  export const brikDescription = 'Short bridge statement between problem and offer.';
</script>

<section class="px-6 py-16">
  <h2 data-brixter-field="statement" data-brixter-kind="richtext-inline">
    A short bridge statement between problem and offer.
  </h2>
  <p data-brixter-field="note" data-brixter-kind="richtext-inline">
    A supporting note that follows the statement.
  </p>
</section>
```

The preprocessor automatically:
- Infers `brixterSchema = { statement: { kind: "richtext-inline", default: "A short bridge statement between problem and offer." }, note: { kind: "richtext-inline", default: "A supporting note that follows the statement." } }`
- Injects `let { statement, note } = $props()`
- Replaces text content with `{@html statement ?? ''}` and `{@html note ?? ''}`

### Example 2: Brik with a Nested Object (href Default)

The `cta.label` and `cta.note` fields are inferred from markup dots. The `cta.href` field needs a default value that the markup can't express (an `<a>` can only hold one `href`), so we declare it in `brikFields`:

```svelte
<script module lang="ts">
  export const brikDescription = 'Final CTA for the landing page.';

  export const brikFields = {
    cta: {
      fields: {
        href: {
          default: '/admin'
        }
      }
    }
  };
</script>

<section class="px-6 py-20">
  <h2 data-brixter-field="headline" data-brixter-kind="richtext-inline">
    Ready to get started?
  </h2>
  <p data-brixter-field="subtitle" data-brixter-kind="richtext-inline">
    Start building pages that are editable, versioned, and ready to grow.
  </p>
  <a href="#" data-brixter-field="cta.label" data-brixter-bind="href:cta.href">
    Start now
  </a>
  <p data-brixter-field="cta.note" data-brixter-kind="richtext-inline">
    No credit card required.
  </p>
</section>
```

Note: `headline`, `subtitle`, `cta.label`, and `cta.note` are fully inferred from markup. Only `cta.href` needs the explicit default.

### Example 3: Brik with a Collection (Repeating Items)

Collections need `label`, `itemLabel`, and `summaryField` in `brikFields`. If a collection item field has a special `kind` (like `icon`) or needs a `default`, declare those in `item.fields`:

```svelte
<script module lang="ts">
  export const brikDescription = 'Core offer presentation with key points and CTA.';

  export const brikFields = {
    features: {
      label: 'Offer points',
      itemLabel: 'Point',
      summaryField: 'title',
      item: {
        fields: {
          icon: {
            kind: 'icon',
            default:
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'
          }
        }
      }
    },
    cta: {
      fields: {
        href: {
          default: '/admin'
        }
      }
    }
  };
</script>

<section class="px-6 py-20">
  <h2 data-brixter-field="headline" data-brixter-kind="richtext-inline">Headline</h2>
  <p data-brixter-field="description" data-brixter-kind="richtext-inline">Description</p>
  <a href="#" data-brixter-field="cta.label" data-brixter-bind="href:cta.href">CTA</a>

  <div data-brixter-collection-item="features">
    <span data-brixter-field="features[].icon" data-brixter-kind="icon">
      <svg><!-- icon --></svg>
    </span>
    <h3 data-brixter-field="features[].title">Feature title</h3>
    <p data-brixter-field="features[].text" data-brixter-kind="richtext-inline">Feature text</p>
  </div>
</section>
```

At build time, the collection item container is transformed to:

```svelte
{#each features as point}
  <div>
    <span>{@html point.icon ?? ''}</span>
    <h3>{point.title}</h3>
    <p>{@html point.text ?? ''}</p>
  </div>
{/each}
```

### Example 4: Brik with a Collection and No Special Item Fields

When collection item fields are all plain text (inferrable), the `item.fields` can be empty:

```svelte
<script module lang="ts">
  export const brikDescription = 'Team section or project signature.';

  export const brikFields = {
    members: {
      label: 'Members',
      itemLabel: 'Member',
      summaryField: 'name',
      item: {
        fields: {}
      }
    }
  };
</script>

<section class="px-6 py-20">
  <article data-brixter-collection-item="members">
    <h3 data-brixter-field="members[].name">Developer</h3>
    <p data-brixter-field="members[].role">Components and repository</p>
    <p data-brixter-field="members[].bio" data-brixter-kind="richtext-inline">Bio text</p>
  </article>
</section>
```

## How the Build Pipeline Works

1. **Vite preprocessor** scans `.brix.svelte` files and:
   - Parses markup to extract field structure from `data-brixter-*` attributes
   - Merges with any `brikFields` export from `<script module>`
   - Auto-generates `brixterSchema` export
   - Auto-generates `$props()` destructuring
   - Rewrites annotated elements to use Svelte expressions (`{field}`, `{@html field}`)
   - Wraps `data-brixter-collection-item` containers in `{#each}` blocks

2. **Adapter** (`createBrixDefinitions`) reads the compiled module and source at build/startup time, producing a `BuilderDefinition` with:
   - `type` — component name (from filename)
   - `path` — import path (`$lib/brixter/brix/Name.brix.svelte`)
   - `description` — from `brikDescription` export
   - `mode` — `'component'` (or `'markdown'` if set via `brikMode`)
   - `component` — the Svelte component default export
   - `defaults` — auto-generated fallback values
   - `previewBindings` — selectors and paths for preview interactions
   - `collections` — collection metadata for the inspector sidebar
   - `fields` — the complete merged field schema

3. **Pages** reference briks by type name in `.brix.yaml` files:

```yaml
title: My Page
description: A page built with briks.
components:
  - type: Hero
    props:
      eyebrow: Welcome
      headline: Build faster
      cta:
        label: Get started
        href: /admin
  - type: Footer
    props:
      brand: MyBrand
```

## Rules of Thumb

- **Default to zero `<script module>` metadata.** Start with just `brikDescription` and see if the markup alone is enough.
- **Add `brikFields` incrementally.** If a collection needs a `label`, add it. If a nested field needs a `default`, add just that field. The preprocessor merges — you never duplicate what markup already expresses.
- **Use plain static markup text for simple defaults.** Reserve `brikFields` defaults for complex values (icons, nested objects) or for fields that have no element (like `href`).
- **Always provide `summaryField` for collections.** It's the field shown in the sidebar list for each item (usually `title`, `name`, or `label`).
- **The `[]` syntax in `data-brixter-field` is mandatory** for collection item fields. Write `features[].title`, not `features.title`.
- **`data-brixter-bind` replaces static attribute values** with dynamic Svelte expressions. Use it for `href`, `src`, `target`, `alt`, or any attribute that should come from props.