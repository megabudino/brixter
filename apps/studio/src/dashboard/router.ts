import { error, redirect, type Actions, type RequestEvent } from '@sveltejs/kit';
import { getCoreConfigIssues } from '../server/config.ts';
import { isSetupComplete } from '../server/setup.ts';
import { isLocalMode } from '../server/content-store.ts';
import { loadLogin } from './loaders/login.ts';
import { loadAccounts } from './loaders/accounts.ts';
import { loadBranch } from './loaders/branch.ts';
import { loadMedia } from './loaders/media.ts';
import { loadPublish } from './loaders/publish.ts';
import { loginAction, setupAction, inviteAccountAction } from './actions/auth.ts';
import { saveAction, createPageAction } from './actions/content.ts';
import { mergeAction } from './actions/merge.ts';
import { createDirectoryAction } from './actions/directory.ts';
import { deleteRouteAction, deleteMediaAction } from './actions/delete.ts';
import { renameRouteAction } from './actions/rename.ts';
import { createMediaDirectoryAction, uploadMediaAction } from './actions/media.ts';
import { publishAction } from './actions/publish.ts';
import { matchPage, type DashboardPage, type PageMatch } from './shared.ts';

export async function loadDashboard(event: RequestEvent) {
	if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');

	const configIssues = getCoreConfigIssues();
	if (configIssues.length > 0) {
		return {
			page: 'config-error' as const,
			showNav: false,
			pageData: { issues: configIssues }
		};
	}

	const match = matchPage(event.url.pathname);

	if (match.page === 'config-error') {
		throw redirect(302, '/admin/routes');
	}

	if (!isSetupComplete() && match.page !== 'setup') {
		throw redirect(302, '/admin/setup');
	}

	if (isSetupComplete() && match.page === 'setup') {
		throw redirect(302, '/admin/routes');
	}

	const isPublic = match.page === 'login' || match.page === 'setup';

	if (!isPublic && !event.locals.user) {
		throw redirect(302, '/admin/login?reason=required');
	}

	let pageData: Record<string, unknown>;
	switch (match.page) {
		case 'login':
			pageData = await loadLogin(event);
			break;
		case 'setup':
			pageData = {};
			break;
		case 'accounts':
			pageData = await loadAccounts(event);
			break;
		case 'branch':
			pageData = await loadBranch(event, match);
			break;
		case 'media':
			pageData = await loadMedia(event, match);
			break;
		case 'publish':
			pageData = await loadPublish(event, match);
			break;
	}

	return {
		page: match.page,
		showNav: Boolean(event.locals.user) && match.page !== 'login' && match.page !== 'setup',
		isLocal: isLocalMode(),
		pageData
	};
}

export const dashboardActions: Actions = {
	login: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'login') throw error(405, 'Method not allowed');
		return loginAction(event);
	},
	setup: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'setup') throw error(405, 'Method not allowed');
		return setupAction(event);
	},
	inviteAccount: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'accounts') throw error(405, 'Method not allowed');
		return inviteAccountAction(event);
	},
	merge: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return mergeAction(event);
	},
	save: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return saveAction(event);
	},
	createDirectory: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createDirectoryAction(event);
	},
	createPage: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createPageAction(event);
	},
	deleteRoute: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return deleteRouteAction(event);
	},
	renameRoute: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return renameRouteAction(event);
	},
	createMediaDirectory: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createMediaDirectoryAction(event);
	},
	uploadMedia: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return uploadMediaAction(event);
	},
	deleteMedia: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return deleteMediaAction(event);
	},
	publish: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'publish') throw error(405, 'Method not allowed');
		return publishAction(event);
	}
};