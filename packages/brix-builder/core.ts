/**
 * Compatibility re-export. The brix format + helpers now live in `@brixter/core`;
 * this shim keeps the editor's local `./core.js` imports (and the package's
 * public surface) working unchanged.
 */

export * from '@brixter/core';
