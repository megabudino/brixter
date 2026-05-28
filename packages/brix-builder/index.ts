export { default as BrixEditor } from './editor/BuilderApp.svelte';
export { createBrixDefinitions, type BrikDefinition } from './svelte/adapter.js';
export { createBrikSchemaFromMarkup } from './svelte/markup-schema.js';
export { serializeToMdsvex as exportBrixToMdsvex } from './core.js';

export type {
	BuilderBlock as Brik,
	BuilderCollection as BrikCollection,
	BuilderDefinition as BrikDefinitionBase,
	BuilderDocument as BrixDocument,
	BuilderField as BrikField,
	BuilderFields as BrikFields,
	BuilderPreviewBinding as BrikPreviewBinding,
	BuilderRichTextValue as BrikRichTextValue
} from './core.js';
