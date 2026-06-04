import { betterAuth } from 'better-auth';
import type { Auth } from 'better-auth/types';
import { getCoreConfig } from './config.ts';
import { getDb } from './db.ts';

function build(): Auth {
	const { origin, authSecret } = getCoreConfig();
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
		plugins: []
	}) as unknown as Auth;
}

export type BrixterAuth = Auth;

let instance: BrixterAuth | null = null;

/**
 * Lazily create the BetterAuth instance. Uses the resolved brixter config
 * (auth secret + origin) and the lazily-opened DB.
 */
export function getAuth(): BrixterAuth {
	if (!instance) instance = build();
	return instance;
}
