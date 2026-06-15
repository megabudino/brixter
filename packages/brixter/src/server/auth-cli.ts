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
import { createAuthOptions } from './auth-migrate.ts';

export const auth = betterAuth(createAuthOptions());
