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

export function isRouteGroupSegment(segment: string): boolean {
	return segment.startsWith('(') && segment.endsWith(')');
}

function publicSegmentsForDirPath(root: string, dirPath: string): string[] {
	return relativeToRepoRoot(dirPath, root)
		.split('/')
		.filter(Boolean)
		.filter((segment) => !isRouteGroupSegment(segment));
}

export function routeDirUrlPath(root: string, dirPath: string): string {
	return publicSegmentsForDirPath(root, dirPath).join('/');
}

export function routePageUrlPath(root: string, dirPath: string): string {
	return [routeDirUrlPath(root, dirPath), '+page'].filter(Boolean).join('/');
}

export function pageFileUrlPath(root: string, filePath: string): string {
	const dirPath = filePath.split('/').slice(0, -1).join('/');
	return routePageUrlPath(root, dirPath);
}

function resolveVisibleRouteNodes(node: RouteNode, segments: string[]): RouteNode[] {
	if (segments.length === 0) return [node];

	const [segment, ...rest] = segments;
	const matches: RouteNode[] = [];

	for (const child of node.children) {
		if (isRouteGroupSegment(child.segment)) {
			matches.push(...resolveVisibleRouteNodes(child, segments));
			continue;
		}
		if (child.segment === segment) {
			matches.push(...resolveVisibleRouteNodes(child, rest));
		}
	}

	return matches;
}

function pageCarrierNodes(node: RouteNode): RouteNode[] {
	const matches: RouteNode[] = [];
	if (node.page) matches.push(node);

	for (const child of node.children) {
		if (!isRouteGroupSegment(child.segment)) continue;
		matches.push(...pageCarrierNodes(child));
	}

	return matches;
}

function visibleChildren(node: RouteNode): RouteNode[] {
	const matches: RouteNode[] = [];

	for (const child of node.children) {
		if (isRouteGroupSegment(child.segment)) {
			matches.push(...visibleChildren(child));
			continue;
		}
		matches.push(child);
	}

	return matches.sort((a, b) => a.label.localeCompare(b.label));
}

function publicPageNodeForFile(
	node: RouteNode,
	filePath: string,
	currentPublicNode: RouteNode = node
): RouteNode | null {
	if (node.pages.some((page) => page.filePath === filePath)) return currentPublicNode;

	for (const child of node.children) {
		const nextPublicNode = isRouteGroupSegment(child.segment) ? currentPublicNode : child;
		const match = publicPageNodeForFile(child, filePath, nextPublicNode);
		if (match) return match;
	}

	return null;
}

export function resolveRouteUrlPath(root: RouteNode, routePath: string): RouteUrlPath {
	const path = normalizeRepoPath(routePath);
	const parts = path ? path.split('/') : [];
	const pageMarkerIndex = parts.indexOf('+page');

	if (pageMarkerIndex !== -1 && pageMarkerIndex !== parts.length - 1) {
		throw new Error('Page marker must be the last route segment.');
	}

	const kind: RouteUrlPath['kind'] = pageMarkerIndex === -1 ? 'route' : 'page';
	const dirParts = kind === 'page' ? parts.slice(0, -1) : parts;
	const routeMatches = resolveVisibleRouteNodes(root, dirParts);

	if (routeMatches.length === 0) {
		throw new Error('Route not found.');
	}
	if (routeMatches.length > 1) {
		throw new Error(`Ambiguous route path "${path}".`);
	}

	if (kind === 'route') {
		return { kind, path, dirPath: routeMatches[0].dirPath };
	}

	const pageMatches = pageCarrierNodes(routeMatches[0]);
	if (pageMatches.length === 0) {
		throw new Error('Page not found.');
	}
	if (pageMatches.length > 1) {
		throw new Error(`Ambiguous page path "${path}".`);
	}

	return { kind, path, dirPath: pageMatches[0].dirPath };
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
	if (isRouteGroupSegment(name)) return name.slice(1, -1);
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
	return page.kind === 'brix';
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
		visibleChildren(node ?? root).find((child) => child.segment.toLowerCase() === segment.toLowerCase()) ??
		null
	);
}

export function childDirNames(root: RouteNode, currentDir: string): string[] {
	return visibleChildren(findRouteNode(root, currentDir) ?? root).map((child) => child.segment);
}

export function childPageNames(root: RouteNode, currentDir: string): string[] {
	return visibleChildren(findRouteNode(root, currentDir) ?? root)
		.filter((child) => pageCarrierNodes(child).length > 0)
		.map((child) => child.segment);
}

export function getExplorerListing(root: RouteNode, currentDir: string): ExplorerEntry[] {
	const node = findRouteNode(root, currentDir);
	if (!node) return [];

	const entries: ExplorerEntry[] = [];
	const currentPageNode = pageCarrierNodes(node)[0];
	if (currentPageNode && node.dirPath === root.dirPath) {
		entries.push({
			kind: 'page',
			label: pageDisplayName(node, currentPageNode.page!, 'index'),
			path: pageFileUrlPath(root.dirPath, currentPageNode.page!.filePath),
			filePath: currentPageNode.page!.filePath,
			routeDirPath: node.dirPath,
			downloadUrl: null,
			hasPage: true,
			fileTypeLabel: pageTypeLabel(currentPageNode.page!),
			disabled: !isEditablePage(currentPageNode.page!)
		});
	}

	for (const child of visibleChildren(node)) {
		const childPageNode = pageCarrierNodes(child)[0];
		const hasVisibleChildren = visibleChildren(child).length > 0;
		if (childPageNode?.page) {
			entries.push({
				kind: 'page',
				label: pageDisplayName(child, childPageNode.page, 'segment'),
				path: pageFileUrlPath(root.dirPath, childPageNode.page.filePath),
				filePath: childPageNode.page.filePath,
				routeDirPath: child.dirPath,
				downloadUrl: null,
				hasPage: true,
				fileTypeLabel: pageTypeLabel(childPageNode.page),
				disabled: !isEditablePage(childPageNode.page)
			});
		}

		if (hasVisibleChildren || !childPageNode?.page) {
			entries.push({
				kind: 'route',
				label: child.label,
				path: routeDirUrlPath(root.dirPath, child.dirPath),
				routeDirPath: child.dirPath,
				downloadUrl: null,
				hasPage: !!childPageNode?.page
			});
		}
	}

	return entries;
}

function routeBreadcrumbsForDir(root: RouteNode, dirPath: string): ExplorerBreadcrumb[] {
	const parts = publicSegmentsForDirPath(root.dirPath, dirPath);
	if (parts.length === 0) return [];
	return parts.map((part, index) => ({
		label: routeLabel(part),
		path: parts.slice(0, index + 1).join('/')
	}));
}

export function routeBreadcrumbs(root: RouteNode, path: string): ExplorerBreadcrumb[] {
	const page = findPageFile(root, path);
	if (!page) return routeBreadcrumbsForDir(root, path);

	const node = publicPageNodeForFile(root, page.filePath);
	const dirPath = node?.dirPath ?? page.filePath.split('/').slice(0, -1).join('/');
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
