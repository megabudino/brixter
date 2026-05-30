import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { getConfig } from './config.ts';
import { getDb } from './db.ts';

function build() {
	const { origin, authSecret } = getConfig();
	return betterAuth({
		baseURL: origin,
		secret: authSecret,
		database: getDb(),
		emailAndPassword: {
			enabled: true,
			allowClientUserCreation: false
		},
		user: {
			additionalFields: {
				role: {
					type: 'string',
					required: false,
					defaultValue: 'user',
					input: false
				}
			}
		},
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

export type BrixterAuth = ReturnType<typeof build>;

let instance: BrixterAuth | null = null;

/**
 * Lazily create the BetterAuth instance. Uses the resolved brixter config
 * (auth secret + origin) and the lazily-opened DB.
 */
export function getAuth(): BrixterAuth {
	if (!instance) instance = build();
	return instance;
}
