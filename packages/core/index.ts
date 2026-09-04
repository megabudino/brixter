/**
 * `@brixter/core` — the framework-agnostic brix engine.
 *
 * Everything a Brixter site needs to go from files to HTML, with no editor,
 * Svelte or DOM code: the `.brix` template language (parser, interpreter and
 * the analyzer that derives a brik's schema from its markup), the `.md` page
 * format, the validator that holds the two to their contract, and the document
 * model the visual editor works against.
 *
 * Its only dependency is `yaml`.
 */

export * from './frontmatter.js';
export * from './template/index.js';
export * from './schema/index.js';
export * from './page/index.js';
export * from './builder.js';
