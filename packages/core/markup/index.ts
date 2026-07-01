/**
 * Standalone brix markup renderer.
 *
 * This entry is intentionally free of any editor/Svelte dependencies — it pulls
 * in only the parser and interpreter — so published pages can render brix at
 * build/SSR time without bundling the authoring UI. The editor imports the same
 * functions via the package root.
 */

export { render, renderToString, renderBrixSource, stripFrontmatter } from './render.js';
export { parseTemplate, type TemplateNode } from './parser.js';
