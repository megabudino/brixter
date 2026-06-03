import { describe, expect, it } from 'vitest';
import {
	buildSvelteKitRouteTree,
	childDirNames,
	childPageNames,
	getExplorerListing,
	pageFileUrlPath,
	resolveRouteUrlPath,
	routeDirUrlPath
} from './sveltekit-routes.ts';

const routesRoot = 'src/routes';
const routeTree = buildSvelteKitRouteTree(
	[
		{ path: 'src/routes/(site)', type: 'tree' },
		{ path: 'src/routes/(site)/about', type: 'tree' },
		{ path: 'src/routes/blog', type: 'tree' },
		{ path: 'src/routes/blog/(post)', type: 'tree' },
		{ path: 'src/routes/(site)/+page.svelte', type: 'blob' },
		{ path: 'src/routes/(site)/about/+page.brix.yaml', type: 'blob' },
		{ path: 'src/routes/blog/(post)/+page.md', type: 'blob' }
	],
	routesRoot
);

describe('sveltekit route groups', () => {
	it('strips route group segments from public URLs', () => {
		expect(routeDirUrlPath(routesRoot, 'src/routes/(site)/about')).toBe('about');
		expect(pageFileUrlPath(routesRoot, 'src/routes/blog/(post)/+page.md')).toBe('blog/+page');
	});

	it('resolves public route paths through transparent groups', () => {
		expect(resolveRouteUrlPath(routeTree, 'about')).toMatchObject({
			kind: 'route',
			dirPath: 'src/routes/(site)/about'
		});
		expect(resolveRouteUrlPath(routeTree, 'about/+page')).toMatchObject({
			kind: 'page',
			dirPath: 'src/routes/(site)/about'
		});
		expect(resolveRouteUrlPath(routeTree, 'blog/+page')).toMatchObject({
			kind: 'page',
			dirPath: 'src/routes/blog/(post)'
		});
	});

	it('hides route group directories from explorer siblings', () => {
		expect(childDirNames(routeTree, routesRoot)).toEqual(['about', 'blog']);
		expect(childPageNames(routeTree, routesRoot)).toEqual(['about', 'blog']);
		expect(
			getExplorerListing(routeTree, routesRoot).map((entry) => ({
				kind: entry.kind,
				label: entry.label,
				path: entry.path
			}))
		).toEqual([
			{ kind: 'page', label: 'index', path: '+page' },
			{ kind: 'page', label: 'about', path: 'about/+page' },
			{ kind: 'page', label: 'blog', path: 'blog/+page' }
		]);
	});
});
