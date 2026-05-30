import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from './auth.ts';
import { getCoreConfig } from './config.ts';
import { isSetupComplete } from './setup.ts';

/**
 * SvelteKit handle that wires brixter's auth + setup-wizard flow.
 * Mount in your `hooks.server.ts`:
 *
 *   import { handle as brixterHandle } from 'brixter/server';
 *   import { sequence } from '@sveltejs/kit/hooks';
 *   export const handle = sequence(brixterHandle);
 *
 * Responsibilities:
 * - delegates to BetterAuth's SvelteKit adapter for `<adminPath>/api/auth/*`
 *   and the login page
 * - forces the setup wizard at `<adminPath>/setup` while there are no users
 * - blocks the setup page after an admin exists
 * - hydrates `event.locals.{session,user}` from the active session
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { adminPath } = getCoreConfig();
	const loginPath = `${adminPath}/login`;
	const setupPath = `${adminPath}/setup`;
	const path = event.url.pathname;
	const auth = getAuth();

	if (path.startsWith(`${adminPath}/api/auth`) || path.startsWith(loginPath)) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (!isSetupComplete()) {
		if (!path.startsWith(setupPath)) {
			throw redirect(302, setupPath);
		}
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (path.startsWith(setupPath)) {
		throw redirect(302, adminPath);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
