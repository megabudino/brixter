/**
 * Compile a `+page.md` into a Svelte component.
 *
 * The frontmatter's `brix` list becomes a sequence of rendered sections, its
 * `metadata` becomes both a module export and the input to `<BrixSeo>`, and the
 * markdown body becomes the `content` prop handed to the layout.
 *
 * Compilation is also where a page meets its briks: every entry is checked
 * against the schema inferred from the brik's template, and the issues come
 * back with the compiled code so the caller decides whether to fail the build
 * or warn the dev server.
 */

import {
	issue,
	nearestName,
	parsePage,
	toComponentName,
	validateProps,
	type SchemaIssue
} from '@brixter/core';
import type { BrikRegistry } from './briks.ts';
import { renderMarkdown } from './markdown.ts';
import type { BrixterPluginOptions } from './index.ts';

export interface CompilePageResult {
	code: string;
	issues: SchemaIssue[];
}

const PAGE_FILE = /\+page(@[^.]*)?\.md$/i;

/** Does this module id name a Brixter page? */
export function isBrixPage(id: string): boolean {
	return PAGE_FILE.test(id.split('?', 1)[0]);
}

export function compileBrixPage(
	source: string,
	file: string,
	options: BrixterPluginOptions,
	registry: BrikRegistry
): CompilePageResult {
	const { page, issues, positionOf } = parsePage(source, file);
	const brixDir = options.brixDir ?? '$lib/brixter/brix';
	const layoutsDir = options.layoutsDir ?? '$lib/brixter/layouts';
	const anchors = options.editorAnchors !== false;

	const imports: string[] = [];
	const declarations: string[] = [];
	const sections: string[] = [];
	const imported = new Map<string, { binding: string; kind: 'brix' | 'svelte' }>();
	// A brik's own problems belong to the brik, so they are reported once even
	// when a page uses it several times.
	const reportedBriks = new Set<string>();
	let needsRenderer = false;

	page.brix.forEach((brik, index) => {
		const name = toComponentName(brik.type);
		const registered = registry.get(name);

		if (!registered) {
			issues.push(
				issue('unknown-brik', file, `no brik named \`${brik.type}\`.${suggest(brik.type, registry)}`, {
					path: `brix[${index}].type`,
					...at(positionOf, `brix[${index}].type`)
				})
			);
			return;
		}

		if (registered.definition) {
			if (!reportedBriks.has(name)) {
				reportedBriks.add(name);
				issues.push(...registered.definition.issues);
			}
			issues.push(
				...validateProps(brik.props, registered.definition.schema, {
					file,
					basePath: `brix[${index}].props`,
					locate: (path) => at(positionOf, path)
				})
			);
		}

		let entry = imported.get(name);
		if (!entry) {
			const binding = `Brix${imported.size}`;
			entry = { binding, kind: registered.kind };
			imported.set(name, entry);
			if (registered.kind === 'brix') {
				// Plain markup: import the raw source and interpret it at render time.
				needsRenderer = true;
				imports.push(`import ${binding}Source from '${brixDir}/${name}.brix?raw';`);
			} else {
				imports.push(`import ${binding} from '${brixDir}/${name}.svelte';`);
			}
		}

		const propsName = `brix${index}Props`;
		declarations.push(`const ${propsName} = ${literal(brik.props)};`);
		sections.push(
			entry.kind === 'brix'
				? `{@html renderBrikSource(${entry.binding}Source, ${propsName}, ${literal({ editorAnchors: anchors })})}`
				: `<${entry.binding} {...${propsName}} />`
		);
	});

	const layout = page.layout ?? options.defaultLayout;
	const seo = options.seo !== false;

	if (needsRenderer) imports.unshift(`import { renderBrikSource } from '@brixter/core';`);
	if (layout) imports.unshift(`import BrixLayout from '${layoutsDir}/${toComponentName(layout)}.svelte';`);
	if (seo) imports.unshift(`import BrixSeo from 'brixter/seo';`);

	const content = renderMarkdown(page.body);
	// Declared only when something reads it, so a page with no prose and no
	// layout does not emit an unused binding.
	const contentDeclaration = layout || content ? [`const content = ${literal(content)};`] : [];

	const code = `<script module>
export const frontmatter = ${literal({
		metadata: page.metadata,
		layout: page.layout,
		aliases: page.aliases,
		sitemap: page.sitemap
	})};
export const metadata = frontmatter.metadata;
</script>

<script>
${[...imports, ...contentDeclaration, ...declarations].join('\n')}
</script>

${seo ? '<svelte:head><BrixSeo {...metadata} /></svelte:head>' : ''}
${
	layout
		? `<BrixLayout {metadata} {content}>\n${sections.join('\n')}\n</BrixLayout>`
		: [...sections, content ? '{@html content}' : ''].filter(Boolean).join('\n')
}
`;

	return { code, issues };
}

function at(
	positionOf: (path: string) => { line: number; column: number },
	path: string
): { line: number; column: number } {
	const position = positionOf(path);
	return { line: position.line, column: position.column };
}

/** "Did you mean" for a brik name that is close to one that exists. */
function suggest(type: string, registry: BrikRegistry): string {
	const names = registry.names();
	if (names.length === 0) return '';

	const near = nearestName(type, names);
	if (near) return ` Did you mean \`${near}\`?`;
	return ` Available: ${names.map((name) => `\`${name}\``).join(', ')}.`;
}

function literal(value: unknown): string {
	return JSON.stringify(value ?? null, null, 2);
}
