export interface ExplorerBreadcrumb {
	label: string;
	path: string;
}

export interface RouteEntry {
	name: string;
	type: 'file' | 'dir';
	path: string;
	downloadUrl: string | null;
}

export interface TreeEntry {
	path: string;
	type: 'tree' | 'blob';
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

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function extension(path: string): string {
	const name = baseName(path);
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot);
}

export function isPageFilePath(path: string): boolean {
	return baseName(path).startsWith('+page.');
}

export function routeLabel(name: string): string {
	if (name.startsWith('+page.')) return `index${extension(name)}`;
	if (name.startsWith('(') && name.endsWith(')')) return name.slice(1, -1);
	return name;
}

function pageEntryName(routeSegment: string, pagePath: string): string {
	return `${routeLabel(routeSegment)}${extension(pagePath)}`;
}

export function routeBreadcrumbs(path: string, root: string): ExplorerBreadcrumb[] {
	const relativePath = relativeToRepoRoot(path, root);
	if (!relativePath) return [];

	const parts = relativePath.split('/');
	return parts.map((part, index) => ({
		label: routeLabel(part),
		path: [root, ...parts.slice(0, index + 1)].join('/')
	}));
}

export interface RouteListing {
	/** The `+page.*` that backs the current route, if any. */
	ownPage: RouteEntry | null;
	/** Child routes that lead to at least one page. */
	entries: RouteEntry[];
	/** Raw segment names of every immediate subdirectory (used for collision checks). */
	childDirNames: string[];
}

/**
 * Turn a recursive git tree into a route-centric listing for a single
 * directory level. Routes without any `+page.*` in their subtree are pruned,
 * and a child route that is a leaf page collapses to its page file so a single
 * click opens the editor.
 */
export function buildRouteListing(tree: TreeEntry[], currentDir: string): RouteListing {
	const pagePaths = tree
		.filter((entry) => entry.type === 'blob' && isPageFilePath(entry.path))
		.map((entry) => entry.path);
	const dirPaths = tree.filter((entry) => entry.type === 'tree').map((entry) => entry.path);

	const subtreeHasPage = (dir: string) => pagePaths.some((p) => p.startsWith(dir + '/'));
	const ownPageOf = (dir: string) =>
		pagePaths.find((p) => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/')) ??
		null;

	const ownPagePath = ownPageOf(currentDir);
	const ownPage: RouteEntry | null = ownPagePath
		? { name: `index${extension(ownPagePath)}`, type: 'file', path: ownPagePath, downloadUrl: null }
		: null;

	const childDirNames: string[] = [];
	const entries: RouteEntry[] = [];

	for (const dir of dirPaths) {
		if (!dir.startsWith(currentDir + '/')) continue;
		const rest = dir.slice(currentDir.length + 1);
		if (rest.includes('/')) continue;
		if (rest === '__brixter') continue;

		childDirNames.push(rest);
		if (!subtreeHasPage(dir)) continue;

		const own = ownPageOf(dir);
		const hasDeeperPage = pagePaths.some(
			(p) => p.startsWith(dir + '/') && p.slice(dir.length + 1).includes('/')
		);

		if (own && !hasDeeperPage) {
			entries.push({ name: pageEntryName(rest, own), type: 'file', path: own, downloadUrl: null });
		} else {
			entries.push({ name: routeLabel(rest), type: 'dir', path: dir, downloadUrl: null });
		}
	}

	entries.sort((a, b) =>
		a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
	);

	return { ownPage, entries, childDirNames };
}
