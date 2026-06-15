import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getContentStore } from '../../server/content-store.ts';
import { defaultBranchForConfig, matchPage } from '../shared.ts';
import { getBranchStatus, invalidateBranchRouteCache } from '../repo-cache.ts';

export async function publishAction({ locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'publish') return fail(404, { publishError: 'Not found.' });

	const store = getContentStore();

	if (store.isLocal) {
		return { publishSuccess: true };
	}

	const { aheadBy } = await getBranchStatus(store.branch, defaultBranchForConfig());
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	const result = await store.publish();
	if (!result.success) {
		return fail(500, { publishError: result.error ?? 'Publish failed.' });
	}

	invalidateBranchRouteCache(store.branch);
	throw redirect(302, '/admin/routes');
}