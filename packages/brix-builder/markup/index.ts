/**
 * Standalone brix markup renderer — compatibility entry.
 *
 * The renderer moved to `@brixter/core`; this shim preserves the package's
 * editor-free `@brixter/brix-builder/render` export by re-exporting from there.
 */

export {
	render,
	renderToString,
	renderBrixSource,
	stripFrontmatter,
	parseTemplate,
	type TemplateNode
} from '@brixter/core';
