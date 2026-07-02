# @brixter/core

The agnostic brix engine that powers [Brixter](https://github.com/megabudino/brixter).

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

## Rendering brix

```ts
import { renderBrixSource } from '@brixter/core/render';

const html = renderBrixSource(source, props);
```

Other renderer exports: `render`, `renderToString`, `stripFrontmatter`,
`parseTemplate` (with the `TemplateNode` type).

## Document format & helpers

The package root additionally exposes the brix document model and the helpers the
authoring UI builds on — e.g. `createBuilderDocument`, `createBlock`,
`getCollectionItems`, `createBuilderDefaultsFromFields`, and the
`Builder*`/`BrixYaml*` types. These describe the `.brix.yaml` shape and drive
schema inference; consumers rendering finished pages usually only need
`@brixter/core/render`.

## License

[MIT](./LICENSE)
