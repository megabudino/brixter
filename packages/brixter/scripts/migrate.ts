/**
 * Dev-only wrapper that runs migrate() (Better Auth + brixter SQL) against the local DB.
 * End users get the same behavior via `npx brixter migrate`.
 *
 * Run with `bun scripts/migrate.ts` (bun loads .env automatically).
 */
import { migrate } from '../src/lib/server/migrate.ts';

await migrate();
