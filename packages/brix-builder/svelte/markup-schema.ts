import type { BuilderField, BuilderFieldKind, BuilderFields } from '../core.js';

const BUILDER_FIELD_ATTRIBUTE = 'data-builder-field';
const BUILDER_KIND_ATTRIBUTE = 'data-builder-kind';
const BUILDER_DEFAULT_ATTRIBUTE = 'data-builder-default';
const BUILDER_LABEL_ATTRIBUTE = 'data-builder-label';
const BUILDER_PREVIEW_LABEL_ATTRIBUTE = 'data-builder-preview-label';

interface PathSegment {
	name: string;
	isArray: boolean;
}

export function createBuilderFieldsFromMarkup(source: string): BuilderFields {
	const fields: BuilderFields = {};
	const markup = stripNonMarkupContent(source);

	for (const tag of getStartTags(markup)) {
		const tagName = getTagName(tag);
		if (!tagName) {
			continue;
		}

		const attributes = parseAttributes(tag.slice(tagName.length + 1, -1));
		const path = attributes[BUILDER_FIELD_ATTRIBUTE];
		if (!path) {
			continue;
		}

		insertMarkupField(fields, tokenizePath(path), {
			kind: resolveFieldKind(attributes[BUILDER_KIND_ATTRIBUTE], tagName),
			label: attributes[BUILDER_LABEL_ATTRIBUTE],
			default: attributes[BUILDER_DEFAULT_ATTRIBUTE],
			previewInMarkup: true,
			previewLabel: attributes[BUILDER_PREVIEW_LABEL_ATTRIBUTE]
		});
	}

	return fields;
}

export function createBrikSchemaFromMarkup(source: string): BuilderFields {
	return createBuilderFieldsFromMarkup(source);
}

export function mergeBuilderFields(baseFields: BuilderFields, overrideFields: BuilderFields): BuilderFields {
	const merged = cloneValue(baseFields);

	for (const [key, overrideField] of Object.entries(overrideFields)) {
		const baseField = merged[key];
		merged[key] = mergeBuilderField(baseField, overrideField);
	}

	return merged;
}

function mergeBuilderField(
	baseField: BuilderField | undefined,
	overrideField: BuilderField
): BuilderField {
	if (!baseField) {
		return cloneValue(overrideField);
	}

	return {
		...cloneValue(baseField),
		...cloneValue(overrideField),
		fields:
			baseField.fields || overrideField.fields
				? mergeBuilderFields(baseField.fields ?? {}, overrideField.fields ?? {})
				: undefined,
		item:
			baseField.item || overrideField.item
				? mergeBuilderField(baseField.item ?? {}, overrideField.item ?? {})
				: undefined
	};
}

function insertMarkupField(
	fields: BuilderFields,
	path: PathSegment[],
	field: BuilderField
): void {
	const [segment, ...rest] = path;
	if (!segment) {
		return;
	}

	if (segment.isArray) {
		const existing = fields[segment.name] ?? {};
		const nextItemFields = existing.item?.fields ?? {};
		insertMarkupField(nextItemFields, rest, field);
		fields[segment.name] = {
			...existing,
			kind: 'array',
			item: {
				...existing.item,
				fields: nextItemFields
			}
		};
		return;
	}

	if (rest.length === 0) {
		fields[segment.name] = mergeBuilderField(fields[segment.name], field);
		return;
	}

	const existing = fields[segment.name] ?? {};
	const nestedFields = existing.fields ?? {};
	insertMarkupField(nestedFields, rest, field);
	fields[segment.name] = {
		...existing,
		kind: 'object',
		fields: nestedFields
	};
}

function tokenizePath(path: string): PathSegment[] {
	return path.split('.').map((segment) => ({
		name: segment.replace(/\[\]$/, ''),
		isArray: segment.endsWith('[]')
	}));
}

function resolveFieldKind(value: string | undefined, tagName: string): BuilderFieldKind | undefined {
	if (value === 'text' || value === 'boolean' || value === 'number' || value === 'object') {
		return value;
	}

	if (value === 'array' || value === 'image' || value === 'richtext-inline' || value === 'richtext-block') {
		return value;
	}

	if (tagName.toLowerCase() === 'img') {
		return 'image';
	}

	return undefined;
}

function stripNonMarkupContent(source: string): string {
	return source
		.replace(/<script\b[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '');
}

function getStartTags(source: string): string[] {
	const tags: string[] = [];

	for (let index = 0; index < source.length; index += 1) {
		if (source[index] !== '<') {
			continue;
		}

		const next = source[index + 1];
		if (!next || next === '/' || next === '!' || next === '?') {
			continue;
		}

		let cursor = index + 1;
		let quote: '"' | "'" | null = null;
		let braceDepth = 0;

		while (cursor < source.length) {
			const character = source[cursor];
			if (quote) {
				if (character === quote) {
					quote = null;
				}
				cursor += 1;
				continue;
			}

			if (character === '"' || character === "'") {
				quote = character;
				cursor += 1;
				continue;
			}

			if (character === '{') {
				braceDepth += 1;
				cursor += 1;
				continue;
			}

			if (character === '}') {
				braceDepth = Math.max(0, braceDepth - 1);
				cursor += 1;
				continue;
			}

			if (character === '>' && braceDepth === 0) {
				tags.push(source.slice(index, cursor + 1));
				index = cursor;
				break;
			}

			cursor += 1;
		}
	}

	return tags;
}

function getTagName(tag: string): string | null {
	const match = tag.match(/^<([A-Za-z][A-Za-z0-9:_-]*)\b/);
	return match?.[1] ?? null;
}

function parseAttributes(source: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const attributePattern =
		/([:@A-Za-z_][A-Za-z0-9:._-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;

	for (const match of source.matchAll(attributePattern)) {
		const name = match[1];
		const value = match[3] ?? match[4] ?? match[5];
		if (value !== undefined) {
			attributes[name] = value.trim();
		}
	}

	return attributes;
}

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
