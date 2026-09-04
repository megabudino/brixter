/**
 * Standalone `.brix` template engine.
 *
 * This entry is free of any editor or framework dependency — parser,
 * interpreter and static analyzer only — so published pages can render briks at
 * build/SSR time without pulling in the authoring UI. The editor imports the
 * same functions through the package root.
 */

export {
	render,
	renderToString,
	renderBrikSource,
	COLLECTION_ATTR,
	FIELD_ATTR,
	KIND_ATTR,
	type RenderOptions
} from './render.js';

export {
	parseTemplate,
	bind,
	isVoidElement,
	resolvePath,
	scanExpression,
	type AttributePart,
	type CommentNode,
	type ElementNode,
	type EachNode,
	type IfBranch,
	type IfNode,
	type MustacheNode,
	type PropDeclarationNode,
	type TemplateAttribute,
	type TemplateNode,
	type TextNode
} from './parser.js';

export {
	parseCondition,
	parseEachHeader,
	parseReference,
	TemplateSyntaxError,
	type CompareExpression,
	type CompareOperator,
	type Condition,
	type EachHeader,
	type LiteralExpression,
	type LiteralValue,
	type NotExpression,
	type Reference,
	type Tag
} from './expression.js';

export {
	analyzeTemplate,
	tokenizePath,
	type AnalyzeOptions,
	type AnalyzeResult
} from './analyze.js';

export { sanitizeStyleValue, joinStyleChunks, type StyleChunk } from './style.js';
