/**
 * `@brixter/core` — the agnostic brix engine.
 *
 * Pure parser + runtime interpreter for `.brix` markup plus the brix document
 * format (YAML import/export, field/definition types and helpers). It depends
 * only on `yaml` and contains no editor, Svelte or DOM code, so the public site
 * and the future dashboard can share the same render/format base.
 */

export * from './core.js';
export * from './markup/index.js';
