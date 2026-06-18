import type { Component } from 'svelte';
import type {
	BuilderCollection,
	BuilderDefinition,
	BuilderFields,
	BuilderMode,
	BuilderPreviewBinding
} from '../core.js';
import {
	createBuilderCollectionsFromFields,
	createBuilderDefaultsFromFields,
	createBuilderPreviewBindingsFromFields,
	toComponentName
} from '../core.js';
import { createBrikSchemaFromMarkup, mergeBuilderFields } from './markup-schema.js';

interface BrikModule {
	default: Component<Record<string, unknown>>;
	brikFields?: BuilderFields;
	brikDefaults?: Record<string, unknown>;
	brikDescription?: string;
	brikMode?: BuilderMode;
	brikPreviewBindings?: BuilderPreviewBinding[];
	brikCollections?: BuilderCollection[];
}

interface LayoutModule {
	default: Component<Record<string, unknown>>;
	layoutFields?: BuilderFields;
	layoutDefaults?: Record<string, unknown>;
	layoutDescription?: string;
}

export interface BrikDefinition extends BuilderDefinition {
	component: Component<Record<string, unknown>>;
}

export interface LayoutDefinition {
	name: string;
	description: string;
	fields: BuilderFields;
	defaults: Record<string, unknown>;
}

export function createBrixDefinitions(
	brikModules: Record<string, unknown>,
	brikSources: Record<string, string> = {}
): BrikDefinition[] {
	return Object.entries(brikModules)
		.map(([path, module]) =>
			createDefinition(path, module as BrikModule, brikSources[path] ?? '')
		)
		.sort((a, b) => {
			if (a.mode !== b.mode) {
				return a.mode === 'markdown' ? -1 : 1;
			}

			return a.type.localeCompare(b.type);
		});
}

export function createLayoutDefinitions(
	layoutModules: Record<string, unknown>,
	layoutSources: Record<string, string> = {}
): LayoutDefinition[] {
	return Object.entries(layoutModules)
		.map(([path, module]) =>
			createLayoutDefinition(path, module as LayoutModule, layoutSources[path] ?? '')
		)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function createLayoutDefinition(
	path: string,
	module: LayoutModule,
	source: string
): LayoutDefinition {
	const fileName = path.split('/').pop()?.replace(/\.svelte$/, '') ?? path;
	const name = toComponentName(fileName);
	const markupFields = source ? createBrikSchemaFromMarkup(source) : {};
	const fields = mergeBuilderFields(markupFields, cloneValue(module.layoutFields ?? {}));
	const defaults =
		Object.keys(fields).length > 0
			? mergeDefaults(
					createBuilderDefaultsFromFields(fields),
					cloneValue(module.layoutDefaults ?? {})
				)
			: cloneValue(module.layoutDefaults ?? {});

	return {
		name,
		description: module.layoutDescription ?? `Layout ${humanizeType(name)}.`,
		fields,
		defaults
	};
}

function createDefinition(path: string, module: BrikModule, source: string): BrikDefinition {
	const type = path.split('/').pop()?.replace('.brix.svelte', '') ?? path;
	const markupFields = source ? createBrikSchemaFromMarkup(source) : {};
	const fields = mergeBuilderFields(markupFields, cloneValue(module.brikFields ?? {}));
	const defaults =
		Object.keys(fields).length > 0
			? mergeDefaults(createBuilderDefaultsFromFields(fields), cloneValue(module.brikDefaults ?? {}))
			: cloneValue(module.brikDefaults ?? {});
	const previewBindings =
		Object.keys(fields).length > 0
			? createBuilderPreviewBindingsFromFields(fields)
			: cloneValue(module.brikPreviewBindings ?? []);
	const collections =
		Object.keys(fields).length > 0
			? createBuilderCollectionsFromFields(fields)
			: cloneValue(module.brikCollections ?? []);

	return {
		type,
		path: `$lib/brixter/brix/${type}.brix.svelte`,
		description: module.brikDescription ?? `Brik ${humanizeType(type)}.`,
		mode: module.brikMode ?? 'component',
		component: module.default,
		defaults,
		previewBindings,
		collections,
		fields
	};
}

function humanizeType(type: string): string {
	return type
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[-_ ]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function mergeDefaults(
	baseDefaults: Record<string, unknown>,
	overrideDefaults: Record<string, unknown>
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...baseDefaults };

	for (const [key, value] of Object.entries(overrideDefaults)) {
		const baseValue = merged[key];
		merged[key] =
			isRecord(baseValue) && isRecord(value)
				? mergeDefaults(baseValue, value)
				: cloneValue(value);
	}

	return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
