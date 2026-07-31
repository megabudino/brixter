# @brixter/core

The agnostic brix engine that powers [Brixter](https://github.com/Brixter-Labs/brixter).

A pure parser + runtime interpreter for `.brix` markup, plus the brix document
format (YAML import/export, field/definition types and helpers). It depends only
on [`yaml`](https://www.npmjs.com/package/yaml) and contains **no editor, Svelte
or DOM code**, so a published site and the authoring dashboard can share the same
render/format base.

## Install

```sh
npm install @brixter/core
```

## Entry points

| Import | Contents |
|--------|----------|
| `@brixter/core` | Everything: the document format (fields, definitions, builder helpers) plus the markup renderer. |
| `@brixter/core/render` | Only the standalone renderer — parser + interpreter, no authoring helpers. Use this for build/SSR rendering to keep the bundle minimal. |
| `@brixter/core/sitemap` | Route-path → URL translation, per-page sitemap directives, and the XML serializer. |
| `@brixter/core/redirects` | The redirect compiler: alias reading, validation against a route manifest, chain flattening, and serializers for the hosting layers' native formats. |

## Rendering brix

```ts
import { renderBrixSource } from '@brixter/core/render';

const html = renderBrixSource(source, props);
```

Other renderer exports: `render`, `renderToString`, `stripFrontmatter`,
`parseTemplate` (with the `TemplateNode` type), and the bind helpers
`parseBindings`, `parseStyleDeclarations`, `serializeStyleDeclarations`,
`mergeStyleDeclaration`, `sanitizeStyleValue` (with the `Binding` /
`StyleDeclaration` types).

## `data-brixter-bind`

`data-brixter-bind` wires resolved prop values onto an element's attributes. The
grammar is a `;`-separated list of `target: path` pairs; the **first** `:` of
each pair splits the target from the path, so the target side never contains a
`:` (`style.object-position` is a single target).

```html
<a href="#" data-brixter-bind="href: cta.href; target: cta.target">Go</a>
```

Two kinds of target:

| Target | Effect |
|--------|--------|
| `attr: path` | Replaces the **whole** attribute value. Works for any attribute, including the entire `style` / `class` attribute. |
| `style.<prop>: path` | Merges a **single** CSS declaration into the existing `style` attribute, composing with the static markup instead of clobbering it. `<prop>` may be a CSS property (`object-position`, `background-image`) or a custom property (`--op`). |

### `style.<prop>` semantics (SSR-native)

```html
<img
  style="object-position: 47.5% 50%;"
  data-brixter-field="imageSrc"
  data-brixter-bind="alt: imageAlt; style.object-position: imagePosition" />
```

With `{ imageSrc: '/a.jpg', imageAlt: 'x', imagePosition: '50% 28%' }` this
renders `… src="/a.jpg" alt="x" style="object-position: 50% 28%;"` — the static
default for that one property is overridden, every other declaration is
preserved.

- The static `style` is parsed into ordered declarations; the bound property is
  set/overridden and the rest kept in place, then re-serialized into one
  `style="…"`.
- A `null` / empty resolved value emits **no** declaration and does **not**
  remove a static one already present — the markup default stands.
- Multiple `style.*` targets on the same element accumulate.
- If both `style: path` (whole replace) and `style.<prop>: path` are present, the
  whole replace is applied **first**, then the per-property merges compose onto
  its result.

### Escaping / trust model

`style.<prop>` values follow the same "content is semi-trusted" posture as
richtext `{@html}` — the engine renders author-provided data — but a per-page
value can never inject extra declarations or break out of the attribute:
`sanitizeStyleValue` drops `;`, `{`, `}`, `<`, `>` and folds newlines/tabs to a
space. Quotes and parentheses are **kept** so `url("…")` / `url('…')` survive;
quotes are HTML-escaped to `&quot;` at attribute-serialization time and decoded
back inside the value by the browser.

## Redirects

`@brixter/core/redirects` compiles redirect declarations into one flat, ordered
map. It takes a **list** of sources — a page's `aliases` is the first, and
`pageAliasSource` builds it — plus the routes the app already serves:

```ts
import { compileRedirects, pageAliasSource } from '@brixter/core/redirects';

const rules = compileRedirects({
	sources: [pageAliasSource(pages)],
	routes, // `{ id, pattern }`, e.g. SvelteKit's `builder.routes`
	knownPaths // prerendered pages, static assets
});
```

It throws `RedirectCompileError` on any inconsistency — an alias that shadows an
existing route, is claimed twice, points nowhere, or loops — with every issue
carrying the file that declares the rule. `analyzeRedirects` returns the same
result without throwing, for callers that report rather than stop.

Chains are flattened so each rule resolves in one hop, and the output is sorted
deterministically. `formatRedirectsFile` / `mergeRedirectsFile` serialize to the
`_redirects` format (Netlify, Cloudflare Pages); `toVercelRoutes` to Vercel's
Build Output API. `routeIdToPattern` builds a route matcher for callers that
have no framework manifest to hand.

## Document format & helpers

The package root additionally exposes the brix document model and the helpers the
authoring UI builds on — e.g. `createBuilderDocument`, `createBlock`,
`getCollectionItems`, `createBuilderDefaultsFromFields`, and the
`Builder*`/`BrixYaml*` types. These describe the `.brix.yaml` shape and drive
schema inference; consumers rendering finished pages usually only need
`@brixter/core/render`.

## License

[MIT](./LICENSE)
