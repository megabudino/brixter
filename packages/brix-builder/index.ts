export { default as BrixEditor } from './editor/BuilderApp.svelte';
export { SHORTCUTS, matchesShortcut } from './editor/shortcuts.js';
export {
	createBrixDefinitions,
	createLayoutDefinitions,
	type BrikDefinition,
	type LayoutDefinition
} from './svelte/adapter.js';
export { createBrikSchemaFromMarkup } from './svelte/markup-schema.js';
export {
	createMarkupBrixDefinition,
	createMarkupBrixDefinitions,
	parseBrixFile,
	type MarkupBrikDefinition
} from './markup/loader.js';
export { parseTemplate, type TemplateNode } from './markup/parser.js';
export {
	render as renderBrixMarkup,
	renderToString as renderBrixMarkupToString
} from './markup/render.js';
export {
	parseBrixYamlDocument as importBrixFromYaml,
	serializeToBrixYaml as exportBrixToYaml,
	serializeToMdsvex as exportBrixToMdsvex,
	STANDARD_SEO_FIELDS,
	toComponentName
} from './core.js';

export type {
	BuilderBlock as Brik,
	BuilderCollection as BrikCollection,
	BuilderDefinition as BrikDefinitionBase,
	BuilderDocument as BrixDocument,
	BuilderField as BrikField,
	BuilderFields as BrikFields,
	BuilderPreviewBinding as BrikPreviewBinding,
	BuilderRichTextValue as BrikRichTextValue,
	BrixYamlComponent,
	BrixYamlDocument
} from './core.js';
