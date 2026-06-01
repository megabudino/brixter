import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from './auth.ts';
import { getCoreConfig } from './config.ts';
import { isSetupComplete } from './setup.ts';
import { getOctokit, getRepo } from './github.ts';
import { Buffer } from 'node:buffer';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

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
	const path = event.url.pathname;

	// Serve draft branch images from GitHub if not found locally
	const ext = '.' + path.split('.').pop()?.toLowerCase();
	if (IMAGE_EXTENSIONS.includes(ext)) {
		const { mediaDir } = getCoreConfig();
		const repoPath = [mediaDir, path]
			.map((p) => p.replace(/^\/+|\/+$/g, ''))
			.filter(Boolean)
			.join('/');
		const branch = 'brixter-draft';

		try {
			const octokit = getOctokit();
			const repo = getRepo();
			const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: repoPath,
				ref: branch
			});

			const file = data as { content?: string; encoding?: string };
			if (file.content && file.encoding === 'base64') {
				const contentType = path.endsWith('.svg')
					? 'image/svg+xml'
					: path.endsWith('.webp')
						? 'image/webp'
						: path.endsWith('.png')
							? 'image/png'
							: path.endsWith('.gif')
								? 'image/gif'
								: 'image/jpeg';

				return new Response(Buffer.from(file.content, 'base64'), {
					headers: {
						'Content-Type': contentType,
						'Cache-Control': 'private, max-age=3600'
					}
				});
			}
		} catch (err) {
			// Fall through to normal SvelteKit resolution/404 if not found on GitHub
		}
	}

	const { adminPath } = getCoreConfig();
	const loginPath = `${adminPath}/login`;
	const setupPath = `${adminPath}/setup`;
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
