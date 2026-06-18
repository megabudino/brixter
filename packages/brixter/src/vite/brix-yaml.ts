import path from 'node:path';
import { existsSync } from 'node:fs';
import yaml from 'yaml';
import type { BrixterPluginOptions } from './index.ts';

const { parse: parseYaml } = yaml;

function toComponentName(value: string): string {
	const normalized = value.trim().replace(/\.(svelte|ts|js)$/i, '');
	if (/^[A-Z][A-Za-z0-9]*$/.test(normalized)) return normalized;
	return normalized
		.split(/[-_\s/]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function jsIdentifier(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function literal(value: unknown): string {
	return JSON.stringify(value ?? null, null, 2);
}

interface BrixDocument {
	components?: unknown;
	layout?: unknown;
	[key: string]: unknown;
}

export function compileBrixYaml(
	source: string,
	options: BrixterPluginOptions,
	brixFsDir?: string
): string {
	const parsed = parseYaml(source) as BrixDocument | null;
	const document = parsed && typeof parsed === 'object' ? parsed : {};
	const components = Array.isArray(document.components) ? document.components : [];
	const layout =
		typeof document.layout === 'string' && document.layout.trim()
			? document.layout.trim()
			: options.defaultLayout;
	const metadata = Object.fromEntries(
		Object.entries(document).filter(([key]) => key !== 'components' && key !== 'layout')
	);
	const metadataKeys = Object.keys(metadata).filter(jsIdentifier);
	const brixDir = options.brixDir ?? '$lib/brixter/brix';
	const layoutsDir = options.layoutsDir ?? '$lib/brixter/layouts';

	const imports: string[] = [];
	const blocks: string[] = [];
	const usedComponents = new Map<string, string>();

	components.forEach((component, index) => {
		if (!component || typeof component !== 'object') return;
		const spec = component as { type?: unknown; props?: unknown };
		if (typeof spec.type !== 'string' || !spec.type.trim()) return;

		const componentName = toComponentName(spec.type);
		if (!componentName) return;

		let importName = usedComponents.get(componentName);
		if (!importName) {
			importName = `Brix${usedComponents.size}`;
			usedComponents.set(componentName, importName);
			const ext = pickExtension(brixFsDir, brixDir, componentName);
			imports.push(`import ${importName} from '${brixDir}/${componentName}${ext}';`);
		}

		const propsName = `component${index}Props`;
		const props = spec.props && typeof spec.props === 'object' ? spec.props : {};
		blocks.push(`const ${propsName} = ${literal(props)};`);
		blocks.push(`<${importName} {...${propsName}} />`);
	});

	let layoutImport = '';
	let openingLayout = '';
	let closingLayout = '';
	if (layout) {
		const layoutName = toComponentName(layout);
		layoutImport = `import BrixLayout from '${layoutsDir}/${layoutName}.svelte';`;
		openingLayout = '<BrixLayout {metadata} {...metadata}>';
		closingLayout = '</BrixLayout>';
	}

	const seoEnabled = options.seo !== false;
	const seoImport = seoEnabled ? `import BrixSeo from 'brixter/seo';` : '';
	const seoHead = seoEnabled
		? '<svelte:head><BrixSeo {...metadata} /></svelte:head>'
		: '';

	const componentScripts = blocks.filter((block) => block.startsWith('const ')).join('\n');
	const componentMarkup = blocks.filter((block) => !block.startsWith('const ')).join('\n');
	const destructured =
		metadataKeys.length > 0 ? `const { ${metadataKeys.join(', ')} } = metadata;` : '';

	return `<script module>
export const metadata = ${literal(metadata)};
</script>

<script>
${[seoImport, layoutImport, ...imports, destructured, componentScripts].filter(Boolean).join('\n')}
</script>

${seoHead}
${openingLayout}
${componentMarkup}
${closingLayout}
`;
}

export function isBrixYaml(id: string): boolean {
	const file = id.split('?', 1)[0];
	return /\.brix\.ya?ml$/i.test(file);
}

export function pickExtension(
	brixFsDir: string | undefined,
	_brixDir: string,
	componentName: string
): string {
	if (!brixFsDir) return '.svelte';
	const candidate = path.join(brixFsDir, `${componentName}.brix.svelte`);
	return existsSync(candidate) ? '.brix.svelte' : '.svelte';
}