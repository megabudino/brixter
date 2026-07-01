/**
 * Loader for plain `.brix` markup files.
 *
 * A `.brix` file is YAML frontmatter (metadata that used to live in
 * `<script module>` exports) followed by an annotated HTML body:
 *
 *   ---
 *   description: Primary hero section
 *   fields:
 *     cta: { fields: { href: { default: /admin } } }
 *   ---
 *   <section> ... data-brixter-* annotated markup ... </section>
 *
 * Unlike the Svelte adapter (which consumed compiled modules), this builds a
 * definition purely from the file *text*, so brix can be loaded at runtime
 * (e.g. fetched from GitHub) without a build step. The schema/defaults/collections
 * are derived with the same Svelte-independent core helpers used today; the body
 * is parsed once into a template AST and rendered by the runtime interpreter.
 */

import yaml from 'yaml';
import {
	createBuilderCollectionsFromFields,
	createBuilderDefaultsFromFields,
	createBuilderPreviewBindingsFromFields,
	parseTemplate,
	toComponentName,
	type BuilderDefinition,
	type BuilderFields,
	type BuilderMode,
	type TemplateNode
} from '@brixter/core';
import { createBuilderFieldsFromMarkup, mergeBuilderFields } from '../svelte/markup-schema.js';

const { parse: parseYaml } = yaml;

export interface MarkupBrikDefinition extends BuilderDefinition {
	/** Parsed template body, rendered against props by the interpreter. */
	template: TemplateNode[];
}

interface BrixFrontmatter {
	description?: string;
	mode?: BuilderMode;
	fields?: BuilderFields;
	defaults?: Record<string, unknown>;
}

interface ParsedBrixFile {
	frontmatter: BrixFrontmatter;
	body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseBrixFile(source: string): ParsedBrixFile {
	const match = source.match(FRONTMATTER_PATTERN);
	if (!match) {
		return { frontmatter: {}, body: source };
	}

	const parsed = parseYaml(match[1]);
	const frontmatter =
		parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as BrixFrontmatter)
			: {};

	return { frontmatter, body: source.slice(match[0].length) };
}

/**
 * Build a brik definition from a `.brix` file's text.
 *
 * @param name   Logical name (file stem), used to derive the component `type`.
 * @param source Full file contents (frontmatter + body).
 */
export function createMarkupBrixDefinition(name: string, source: string): MarkupBrikDefinition {
	const { frontmatter, body } = parseBrixFile(source);
	const type = toComponentName(stripBrixExtension(name));

	const markupFields = createBuilderFieldsFromMarkup(body);
	const fields = mergeBuilderFields(markupFields, clone(frontmatter.fields ?? {}));
	const hasFields = Object.keys(fields).length > 0;

	const defaults = hasFields
		? mergeDefaults(createBuilderDefaultsFromFields(fields), clone(frontmatter.defaults ?? {}))
		: clone(frontmatter.defaults ?? {});

	return {
		type,
		path: `${type}.brix`,
		description: frontmatter.description ?? `Brik ${humanize(type)}.`,
		mode: frontmatter.mode ?? 'component',
		defaults,
		previewBindings: hasFields ? createBuilderPreviewBindingsFromFields(fields) : [],
		collections: hasFields ? createBuilderCollectionsFromFields(fields) : [],
		fields,
		template: parseTemplate(body)
	};
}

export function createMarkupBrixDefinitions(
	sources: Record<string, string>
): MarkupBrikDefinition[] {
	return Object.entries(sources)
		.map(([name, source]) => createMarkupBrixDefinition(name, source))
		.sort((a, b) => {
			if (a.mode !== b.mode) {
				return a.mode === 'markdown' ? -1 : 1;
			}
			return a.type.localeCompare(b.type);
		});
}

function stripBrixExtension(name: string): string {
	return (name.split('/').pop() ?? name).replace(/\.brix(\.html)?$/i, '');
}

function humanize(type: string): string {
	return type
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[-_ ]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function mergeDefaults(
	base: Record<string, unknown>,
	override: Record<string, unknown>
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const baseValue = merged[key];
		merged[key] =
			isRecord(baseValue) && isRecord(value) ? mergeDefaults(baseValue, value) : clone(value);
	}
	return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
