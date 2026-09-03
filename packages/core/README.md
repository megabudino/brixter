# @brixter/core

The agnostic brix engine that powers [Brixter](https://github.com/Brixter-Labs/brixter).

Everything needed to go from files to HTML, with no editor, Svelte or DOM code:
the `.brix` template language, the `.md` page format, the analyzer that derives
a brik's schema from its own markup, and the validator that holds pages to it.
It depends only on [`yaml`](https://www.npmjs.com/package/yaml), so a published
site and the authoring dashboard can share the same base.

## Install

```sh
npm install @brixter/core
```

## Entry points

| Import                    | Contents                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@brixter/core`           | Everything, plus the document model the authoring UI builds on.                                                                                      |
| `@brixter/core/template`  | The template engine — parser, interpreter, static analyzer. No authoring helpers. Use this for build/SSR rendering to keep the bundle minimal.       |
| `@brixter/core/schema`    | `buildBrikSchema` and the page validator.                                                                                                            |
| `@brixter/core/page`      | The `+page.md` format: parse and serialize.                                                                                                          |
| `@brixter/core/sitemap`   | Route-path → URL translation, per-page sitemap directives, and the XML serializer.                                                                   |
| `@brixter/core/redirects` | The redirect compiler: alias reading, validation against a route manifest, chain flattening, and serializers for the hosting layers' native formats. |

## Rendering a brik

```ts
import { renderBrikSource } from '@brixter/core/template';

const html = renderBrikSource(source, props);
```

The template language is HTML with braces — `{path}`, `{#each xs as x}`,
`{#if}`/`{:else}` — where an interpolation may carry `@tag` annotations and a
`??` fallback:

```brix
<h1>{@richtext @required headline}</h1>
<p>{eyebrow ?? 'Pricing'}</p>

{#each plans as plan}
  <article data-featured={plan.featured}>
    <h3>{plan.name}</h3>
    <a href={plan.ctaHref ?? '#'}>{plan.ctaLabel ?? 'Get started'}</a>
  </article>
{/each}
```

Other exports: `render` (over a pre-parsed AST), `renderToString`,
`parseTemplate`, `analyzeTemplate`, and the expression parsers
(`parseReference`, `parseCondition`, `parseEachHeader`).

Rendering emits `data-brixter-field` and `data-brixter-collection-item` onto the
elements the visual editor binds click-to-edit to — an element whose whole
content is one interpolation, and the sole element inside an `{#each}`. Pass
`{ editorAnchors: false }` to leave them out.

## The schema is the template

There is no schema document. `buildBrikSchema` reads a `.brix` file and derives
the props it accepts from the markup that uses them:

```ts
import { buildBrikSchema, validateProps } from '@brixter/core/schema';

const { schema, nodes, issues } = buildBrikSchema(source, { file: 'Hero.brix' });
const problems = validateProps(page.brix[0].props, schema, { file: '+page.md' });
```

A type comes from how a prop is used — the collection of an `{#each}` is an
array, a path with sub-paths is an object, `src=` implies an image, `href=` a
URL — refined by any explicit `@tag`. `@enum` is the one type nothing can infer.

Neither function throws. `validateProps` returns every issue it finds, each
carrying a code, a message already prefixed with the file, and the path of the
field at fault; `compileBrikSchema` is the throwing variant for build-time
callers. This mirrors the redirect compiler's `analyze*` / `compile*` split.

## Attributes and `style`

An attribute whose value is a lone interpolation disappears when the value is
absent or `false`, so `data-featured={plan.featured}` is only present on a
featured plan. A `true` is written as `="true"`, so attribute-value selectors
(Tailwind's `data-[featured=true]:`) still match.

Inside `style`, a declaration whose interpolation resolves to nothing is dropped
while the others stand:

```brix
<img style="object-fit: cover; object-position: {position};" src={@image src} />
```

With no `position`, this renders `style="object-fit: cover;"` — the markup's own
default survives rather than being clobbered by an empty value.

### Escaping / trust model

Only `@richtext` and `@icon` emit markup from content, and their values are
treated as semi-trusted and are not sanitised. Interpolated `style` values are:
`sanitizeStyleValue` drops `;`, `{`, `}`, `<`, `>` and folds newlines/tabs to a
space, so a per-page value can never inject an extra declaration or break out of
the attribute. Quotes and parentheses are **kept** so `url("…")` survives; quotes
are HTML-escaped to `&quot;` at serialization time and decoded back inside the
value by the browser.

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

## Document model & authoring helpers

The package root additionally exposes what the visual editor builds on:
`documentFromPage` / `pageFromDocument` to move between a parsed page and an
editable document, `previewBindingsFromSchema` and `collectionsFromSchema` to
turn an inferred schema into a field list and a set of editable collections,
`createFallbackProps` to synthesise the placeholder content a preview shows
before anything is written, and the prop-manipulation primitives
(`updatePropsAtPath`, `addCollectionItem`, `reorderCollectionItem`, …).

Consumers rendering finished pages need none of it — `@brixter/core/template`
is enough.

## License

[MIT](./LICENSE)
