/**
 * Compatibility re-export. The template parser now lives in `@brixter/core`;
 * this shim keeps the editor's local `../markup/parser.js` imports working.
 */

export { parseTemplate, type TemplateNode } from '@brixter/core';
