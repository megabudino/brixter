/**
 * Stand-alone BetterAuth instance exposed for the better-auth CLI, which
 * expects an eagerly-evaluated `export const auth`. The runtime app should
 * keep using `getAuth()` from ./auth, which is lazy and integrates with
 * SvelteKit's request lifecycle.
 *
 * Run via:
 *   bunx @better-auth/cli generate --config src/lib/server/auth-cli.ts
 *   bunx @better-auth/cli migrate  --config src/lib/server/auth-cli.ts
 */
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

export const auth = betterAuth({
	baseURL: process.env.ORIGIN ?? 'http://localhost:5173',
	secret: process.env.BRIXTER_AUTH_SECRET ?? 'cli-placeholder-secret',
	database: new Database(process.env.DATABASE_URL ?? 'data/brixter.db'),
	emailAndPassword: { enabled: true, allowClientUserCreation: false },
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'user',
				input: false
			}
		}
	}
});
