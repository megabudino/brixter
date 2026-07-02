/**
 * Compatibility re-export. The runtime interpreter now lives in `@brixter/core`;
 * this shim keeps the editor's local `../markup/render.js` imports working.
 */

export { render, renderToString, renderBrixSource, stripFrontmatter } from '@brixter/core';
