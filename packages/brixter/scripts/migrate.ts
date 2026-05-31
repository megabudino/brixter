/**
 * Dev-only wrapper that runs the packaged migrate() against the local site DB.
 * End users get the same behavior via `npx brixter migrate`.
 *
 * Run with `bun scripts/migrate.ts` (bun loads .env automatically).
 */
import { migrate } from '../src/lib/server/migrate.ts';

await migrate();
