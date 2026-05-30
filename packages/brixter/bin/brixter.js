#!/usr/bin/env node
/**
 * brixter CLI.
 *
 *   brixter migrate    Apply pending SQL migrations to $DATABASE_URL.
 *
 * For richer integration, import `migrate` from `brixter/server` directly.
 */
const command = process.argv[2];

if (!command || command === '-h' || command === '--help') {
	console.log('Usage: brixter migrate');
	process.exit(command ? 0 : 1);
}

if (command !== 'migrate') {
	console.error(`Unknown command: ${command}`);
	console.error('Usage: brixter migrate');
	process.exit(1);
}

try {
	const { migrate } = await import('../dist/server/index.js');
	await migrate();
} catch (err) {
	console.error(err?.message ?? err);
	process.exit(1);
}
