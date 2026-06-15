import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore } from '../../server/content-store.ts';
import {
	findRouteNode,
	childRoute,
	resolveRouteUrlPath,
	isWithinRepoRoot,
	normalizeRepoPath,
	routePageUrlPath,
	type RouteNode,
	type TreeEntry
} from '../../server/sveltekit-routes.ts';
import { getBranchRouteSnapshot, invalidateBranchRouteCache } from '../repo-cache.ts';
import {
	isBrixYamlFile,
	matchPage,
	routesHref,
	validateDirectoryName,
	titleFromRouteName
} from '../shared.ts';

export async function saveAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { saveError: 'Not found.' });

	const formData = await request.formData();
	const markdown = formData.get('markdown')?.toString() ?? '';
	const frontmatterYaml = formData.get('frontmatter')?.toString() ?? '';
	const brixYaml = formData.get('brixYaml')?.toString() ?? '';
	const sha = formData.get('sha')?.toString() ?? '';
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	let routeTree: RouteNode;

	try {
		({ routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			saveError: e.response?.data?.message ?? 'Failed to resolve page.'
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { saveError: 'Not found.' });
	}

	if (routeRequest.kind !== 'page') {
		return fail(400, { saveError: 'Missing file path.' });
	}
	if (!isWithinRepoRoot(routeRequest.dirPath, routesRoot)) {
		return fail(403, { saveError: 'Access denied.' });
	}

	const pageFile = findRouteNode(routeTree, routeRequest.dirPath)?.page;
	if (!pageFile) return fail(404, { saveError: 'Not found.' });
	const filePath = pageFile.filePath;

	const fileContent = isBrixYamlFile(filePath)
		? brixYaml
		: frontmatterYaml.trim()
			? `---\n${frontmatterYaml.trim()}\n---\n${markdown}`
			: markdown;

	const store = getContentStore();
	try {
		await store.writeFile(filePath, fileContent, sha || undefined);
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			saveError: e.response?.data?.message ?? 'Save failed'
		});
	}

	return { saveSuccess: true };
}

export async function createPageAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { createPageError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('page_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError) return fail(400, { createPageError: validationError, pageName: name });

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	let routeTree: RouteNode;
	let tree: TreeEntry[];
	try {
		({ routeTree, tree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createPageError: e.response?.data?.message ?? 'Failed to check route.',
			pageName: name
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { createPageError: 'Not found.', pageName: name });
	}

	const currentPath = routeRequest.dirPath;
	if (!isWithinRepoRoot(currentPath, routesRoot)) {
		return fail(403, { createPageError: 'Access denied.', pageName: name });
	}

	const directoryPath = `${currentPath}/${name}`;
	if (!isWithinRepoRoot(directoryPath, routesRoot)) {
		return fail(403, { createPageError: 'Access denied.', pageName: name });
	}

	const existingRoute = childRoute(routeTree, currentPath, name);
	const existingBlob = tree.find((entry) => entry.type === 'blob' && entry.path === directoryPath);

	if (existingBlob) {
		return fail(409, {
			createPageError: `A file named "${name}" already exists.`,
			pageName: name
		});
	}

	if (existingRoute?.page) {
		return fail(409, {
			createPageError: `Route "${name}" already has a page.`,
			pageName: name
		});
	}

	const title = titleFromRouteName(name);
	const fileContent = `title: ${JSON.stringify(title)}
description: ''
components: []
`;

	const store = getContentStore();
	try {
		await store.writeFile(`${directoryPath}/+page.brix.yaml`, fileContent);
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createPageError: e.response?.data?.message ?? 'Failed to create page.',
			pageName: name
		});
	}

	throw redirect(303, routesHref(routePageUrlPath(routesRoot, directoryPath)));
}
