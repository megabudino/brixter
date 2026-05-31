export interface ExplorerBreadcrumb {
	label: string;
	path: string;
	fileTypeLabel?: string;
}

export interface ExplorerEntry {
	kind: 'page' | 'route';
	label: string;
	path: string;
	downloadUrl: string | null;
	filePath?: string;
	routeDirPath?: string;
	hasPage?: boolean;
	fileTypeLabel?: string;
	disabled?: boolean;
}

export interface TreeEntry {
	path: string;
	type: 'tree' | 'blob';
}

export interface PageFile {
	filePath: string;
	kind: 'brix' | 'markdown' | 'svelte' | 'other';
	extension: string;
}

export interface RouteNode {
	dirPath: string;
	segment: string;
	label: string;
	page: PageFile | null;
	pages: PageFile[];
	children: RouteNode[];
}

export function normalizeRepoPath(value: string | null | undefined): string {
	return value?.trim().replace(/^\/+|\/+$/g, '') ?? '';
}

export function isWithinRepoRoot(path: string, root: string): boolean {
	return path === root || path.startsWith(root + '/');
}

export function relativeToRepoRoot(path: string, root: string): string {
	if (path === root) return '';
	return path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
}

export interface RouteUrlPath {
	kind: 'route' | 'page';
	path: string;
	dirPath: string;
}

export function routeDirUrlPath(root: string, dirPath: string): string {
	return relativeToRepoRoot(dirPath, root);
}

export function routePageUrlPath(root: string, dirPath: string): string {
	return [routeDirUrlPath(root, dirPath), '+page'].filter(Boolean).join('/');
}

export function pageFileUrlPath(root: string, filePath: string): string {
	const dirPath = filePath.split('/').slice(0, -1).join('/');
	return routePageUrlPath(root, dirPath);
}

export function routeUrlPathToDirPath(root: string, routePath: string): RouteUrlPath {
	const path = normalizeRepoPath(routePath);
	const parts = path ? path.split('/') : [];
	const pageMarkerIndex = parts.indexOf('+page');

	if (pageMarkerIndex !== -1 && pageMarkerIndex !== parts.length - 1) {
		throw new Error('Page marker must be the last route segment.');
	}

	const kind: RouteUrlPath['kind'] = pageMarkerIndex === -1 ? 'route' : 'page';
	const dirParts = kind === 'page' ? parts.slice(0, -1) : parts;
	const dirPath = [root, ...dirParts].filter(Boolean).join('/');

	return { kind, path, dirPath };
}

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function extension(path: string): string {
	const name = baseName(path);
	if (name.startsWith('+page.')) return name.slice('+page'.length);
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot);
}

export function isPageFilePath(path: string): boolean {
	return baseName(path).startsWith('+page.');
}

function routeLabel(name: string): string {
	if (name.startsWith('+page.')) return 'index';
	if (name.startsWith('(') && name.endsWith(')')) return name.slice(1, -1);
	return name;
}

function pageKind(path: string): PageFile['kind'] {
	if (/\.brix\.ya?ml$/i.test(path)) return 'brix';
	if (/\.md$/i.test(path)) return 'markdown';
	if (/\.svelte$/i.test(path)) return 'svelte';
	return 'other';
}

function pagePriority(page: PageFile): number {
	const name = baseName(page.filePath).toLowerCase();
	if (name === '+page.brix.yaml') return 0;
	if (name === '+page.brix.yml') return 1;
	if (name === '+page.md') return 2;
	if (name === '+page.svelte') return 3;
	return 4;
}

function pageFile(path: string): PageFile {
	return {
		filePath: path,
		kind: pageKind(path),
		extension: extension(path)
	};
}

function pageDisplayName(node: RouteNode, page: PageFile, style: 'index' | 'segment'): string {
	return style === 'index' ? 'index' : node.label;
}

function pageTypeLabel(page: PageFile): string {
	if (page.kind === 'brix') return 'brix';
	if (page.kind === 'markdown') return 'md';
	if (page.kind === 'svelte') return 'svelte';
	return page.extension.replace(/^\./, '') || 'file';
}

function isEditablePage(page: PageFile): boolean {
	return page.kind === 'brix' || page.kind === 'markdown';
}

function hasHiddenSegment(path: string, root: string): boolean {
	const relativePath = relativeToRepoRoot(path, root);
	return relativePath.split('/').includes('__brixter');
}

function ensureChild(parent: RouteNode, segment: string): RouteNode {
	const existing = parent.children.find((child) => child.segment === segment);
	if (existing) return existing;

	const child: RouteNode = {
		dirPath: [parent.dirPath, segment].filter(Boolean).join('/'),
		segment,
		label: routeLabel(segment),
		page: null,
		pages: [],
		children: []
	};
	parent.children.push(child);
	return child;
}

function sortRouteNode(node: RouteNode): void {
	node.pages.sort((a, b) => pagePriority(a) - pagePriority(b));
	node.page = node.pages[0] ?? null;
	node.children.sort((a, b) => a.label.localeCompare(b.label));
	for (const child of node.children) sortRouteNode(child);
}

export function buildSvelteKitRouteTree(tree: TreeEntry[], routesRoot: string): RouteNode {
	const root: RouteNode = {
		dirPath: routesRoot,
		segment: '',
		label: '',
		page: null,
		pages: [],
		children: []
	};

	const nodes = new Map<string, RouteNode>([[routesRoot, root]]);

	const getNode = (dirPath: string): RouteNode => {
		const existing = nodes.get(dirPath);
		if (existing) return existing;

		const parentPath = dirPath.split('/').slice(0, -1).join('/');
		const segment = baseName(dirPath);
		const parent = getNode(parentPath);
		const child = ensureChild(parent, segment);
		nodes.set(dirPath, child);
		return child;
	};

	for (const entry of tree) {
		if (!isWithinRepoRoot(entry.path, routesRoot)) continue;
		if (hasHiddenSegment(entry.path, routesRoot)) continue;

		if (entry.type === 'tree') {
			getNode(entry.path);
			continue;
		}

		if (!isPageFilePath(entry.path)) continue;
		const dirPath = entry.path.split('/').slice(0, -1).join('/');
		getNode(dirPath).pages.push(pageFile(entry.path));
	}

	sortRouteNode(root);
	return root;
}

export function findRouteNode(root: RouteNode, dirPath: string): RouteNode | null {
	if (root.dirPath === dirPath) return root;
	for (const child of root.children) {
		const match = findRouteNode(child, dirPath);
		if (match) return match;
	}
	return null;
}

export function findPageFile(root: RouteNode, filePath: string): PageFile | null {
	for (const page of root.pages) {
		if (page.filePath === filePath) return page;
	}
	for (const child of root.children) {
		const match = findPageFile(child, filePath);
		if (match) return match;
	}
	return null;
}

export function childRoute(root: RouteNode, currentDir: string, segment: string): RouteNode | null {
	const node = findRouteNode(root, currentDir);
	return (
		node?.children.find((child) => child.segment.toLowerCase() === segment.toLowerCase()) ?? null
	);
}

export function childDirNames(root: RouteNode, currentDir: string): string[] {
	return findRouteNode(root, currentDir)?.children.map((child) => child.segment) ?? [];
}

export function childPageNames(root: RouteNode, currentDir: string): string[] {
	return (
		findRouteNode(root, currentDir)
			?.children.filter((child) => child.page)
			.map((child) => child.segment) ?? []
	);
}

export function getExplorerListing(root: RouteNode, currentDir: string): ExplorerEntry[] {
	const node = findRouteNode(root, currentDir);
	if (!node) return [];

	const entries: ExplorerEntry[] = [];
	if (node.page && node.dirPath === root.dirPath) {
		entries.push({
			kind: 'page',
			label: pageDisplayName(node, node.page, 'index'),
			path: pageFileUrlPath(root.dirPath, node.page.filePath),
			filePath: node.page.filePath,
			routeDirPath: node.dirPath,
			downloadUrl: null,
			hasPage: true,
			fileTypeLabel: pageTypeLabel(node.page),
			disabled: !isEditablePage(node.page)
		});
	}

	for (const child of node.children) {
		if (child.page) {
			entries.push({
				kind: 'page',
				label: pageDisplayName(child, child.page, 'segment'),
				path: pageFileUrlPath(root.dirPath, child.page.filePath),
				filePath: child.page.filePath,
				routeDirPath: child.dirPath,
				downloadUrl: null,
				hasPage: true,
				fileTypeLabel: pageTypeLabel(child.page),
				disabled: !isEditablePage(child.page)
			});
		}

		if (child.children.length > 0 || !child.page) {
			entries.push({
				kind: 'route',
				label: child.label,
				path: routeDirUrlPath(root.dirPath, child.dirPath),
				routeDirPath: child.dirPath,
				downloadUrl: null,
				hasPage: !!child.page
			});
		}
	}

	return entries;
}

function routeBreadcrumbsForDir(root: RouteNode, dirPath: string): ExplorerBreadcrumb[] {
	const relativePath = relativeToRepoRoot(dirPath, root.dirPath);
	if (!relativePath) return [];

	const parts = relativePath.split('/');
	return parts.map((part, index) => ({
		label: routeLabel(part),
		path: parts.slice(0, index + 1).join('/')
	}));
}

export function routeBreadcrumbs(root: RouteNode, path: string): ExplorerBreadcrumb[] {
	const page = findPageFile(root, path);
	if (!page) return routeBreadcrumbsForDir(root, path);

	const dirPath = page.filePath.split('/').slice(0, -1).join('/');
	const node = findRouteNode(root, dirPath);
	return [
		...routeBreadcrumbsForDir(root, dirPath),
		{
			label: pageDisplayName(
				node ?? root,
				page,
				node?.dirPath === root.dirPath ? 'index' : 'segment'
			),
			path: pageFileUrlPath(root.dirPath, page.filePath),
			fileTypeLabel: pageTypeLabel(page)
		}
	];
}
