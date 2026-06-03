#!/usr/bin/env node
/**
 * brixter CLI.
 *
 *   brixter init       Install brixter, wire SvelteKit, and migrate the database.
 *   brixter migrate    Apply Better Auth + brixter SQL migrations to $DATABASE_URL.
 *
 * For richer integration, import `migrate` from `brixter/server` directly.
 */
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { pathToFileURL, fileURLToPath } from 'node:url';

const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
	console.log(`Usage:
  brixter init [--cwd <path>] [--layout embedded|split] [--admin-path <path>] [--icons <pack>] [--no-icons] [--dry-run] [--skip-install] [--skip-migrate]
  brixter reset-password [--email <email>] [--password <password> | --password-stdin] [--cwd <path>]
  brixter migrate [--cwd <path>]`);
}

if (!command || command === '-h' || command === '--help') {
	usage();
	process.exit(command ? 0 : 1);
}

if (command === 'init') {
	try {
		await init(args);
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

if (command === 'reset-password') {
	try {
		await resetPassword(args);
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

if (command === 'migrate') {
	try {
		await runMigrations(parseMigrateArgs(args));
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(1);

function parseInitArgs(argv) {
	const options = {
		cwd: process.cwd(),
		layout: '',
		adminPath: '/admin',
		dryRun: false,
		skipInstall: false,
		skipMigrate: false,
		icons: 'lucide'
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--skip-install') {
			options.skipInstall = true;
		} else if (arg === '--skip-migrate') {
			options.skipMigrate = true;
		} else if (arg === '--layout') {
			options.layout = argv[++i];
		} else if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else if (arg === '--admin-path') {
			options.adminPath = argv[++i];
		} else if (arg === '--icons') {
			const next = argv[i + 1];
			if (next && !next.startsWith('--')) {
				options.icons = next;
				i++;
			} else {
				options.icons = 'lucide';
			}
		} else if (arg === '--no-icons') {
			options.icons = 'none';
		} else {
			throw new Error(`Unknown init option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	if (options.layout && options.layout !== 'embedded' && options.layout !== 'split') {
		throw new Error(`Unknown layout: ${options.layout}. Use "embedded" or "split".`);
	}
	return options;
}

function parseMigrateArgs(argv) {
	const options = { cwd: process.cwd() };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else {
			throw new Error(`Unknown migrate option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	return options;
}

function parseResetPasswordArgs(argv) {
	const options = {
		cwd: process.cwd(),
		email: '',
		password: '',
		passwordStdin: false
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else if (arg === '--email') {
			options.email = argv[++i];
		} else if (arg === '--password') {
			options.password = argv[++i];
		} else if (arg === '--password-stdin') {
			options.passwordStdin = true;
		} else {
			throw new Error(`Unknown reset-password option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	options.email = options.email.trim().toLowerCase();
	return options;
}

async function init(argv) {
	const options = parseInitArgs(argv);
	options.layout = options.layout || (await promptLayout(options));

	const changes = [];
	const skipped = [];
	const manual = [];

	const context = { ...options, changes, skipped, manual };
	assertSvelteKitApp(context);

	if (options.layout === 'split') {
		await initSplit(context);
	} else {
		await initEmbedded(context);
	}

	const changeLabel = options.dryRun ? 'would create/update' : 'created/updated';
	for (const message of changes) console.log(`${changeLabel} ${message}`);
	for (const message of skipped) console.log(`ok ${message}`);
	for (const message of manual) console.log(`manual ${message}`);

	if (options.dryRun) console.log('dry run: no files changed');
	if (manual.length > 0) {
		console.log('\nbrixter init finished with manual steps.');
	} else {
		console.log('\nbrixter init complete.');
	}

	if (options.layout === 'split') {
		console.log('\nSplit layout (two variants, one SvelteKit app):');
		console.log('  Site variant:  BRIXTER_VARIANT=site  → src/routes-site/');
		console.log('  CMS variant:   BRIXTER_VARIANT=cms   → src/routes-cms/');
		console.log('  Dev:           npm run dev:site  |  npm run dev:cms');
		console.log('  Docker:        docker compose -f docker-compose.site.yml up');
		console.log('                 docker compose -f docker-compose.cms.yml up');
	}
}

async function promptLayout(options) {
	if (!process.stdin.isTTY) return 'embedded';

	console.log('\nWhere should Brixter run?\n');
	console.log('  1) Same app as my site (default)');
	console.log('  2) Separate CMS routes\n');

	const answer = (await prompt('Choice [1]: ')).trim();
	if (!answer || answer === '1') return 'embedded';
	if (answer === '2') return 'split';
	throw new Error('Invalid choice. Enter 1 or 2.');
}

async function initEmbedded(context) {
	ensureBrixterPackage(context);
	ensureRouteShims(context, 'src/routes');
	ensureSiteRouteGroup(context, 'src/routes');
	promoteSiteChromeToRouteGroup(context, 'src/routes');
	finalizeRootLayoutIsolation(context, 'src/routes');
	ensureHooks(context);
	ensureVitePlugin(context);
	ensureSvelteExtensions(context);
	ensureEnvExample(context);
	ensureDotEnv(context);
	if (context.icons && context.icons !== 'none') {
		addIconPack(context, context.icons);
	}
	ensureBrixterLayout(context, 'src/routes');
	await setupDatabase(context);
}

async function initSplit(context) {
	ensureBrixterPackage(context);
	migrateLegacyRoutesToVariants(context);
	ensureVariantSvelteConfig(context);
	ensureFlatSiteRoutes(context);
	ensureRouteShims(context, 'src/routes-cms');
	ensureBrixterLayout(context, 'src/routes-cms');
	ensureCmsRootRedirect(context);
	ensureVariantHooks(context);
	ensureVitePlugin(context, { routesRoot: resolveSiteRoutesRoot(context) });
	ensureVariantViteEnvLoader(context);
	ensureSvelteExtensions(context);
	ensureVariantEnvExamples(context);
	ensureVariantDotEnv(context);
	ensureVariantPackageScripts(context);
	ensureDockerComposeFiles(context);
	if (context.icons && context.icons !== 'none') {
		addIconPack(context, context.icons);
	}
	await setupDatabase(context);
}

function ensureCmsEnvForMigrate(context) {
	const cmsEnvPath = path.join(context.cwd, '.env.cms');
	const cmsExamplePath = path.join(context.cwd, '.env.cms.example');
	const legacyEnvPath = path.join(context.cwd, '.env');

	if (!existsSync(cmsExamplePath)) {
		ensureEnvEntries(context, '.env.cms.example', cmsVariantEnvEntries());
	}

	const cmsEnv = existsSync(cmsEnvPath) ? readEnvFile(cmsEnvPath) : {};
	const needsCmsEnv =
		!existsSync(cmsEnvPath) || !present(cmsEnv.DATABASE_URL) || !present(cmsEnv.BRIXTER_AUTH_SECRET);

	if (!needsCmsEnv) return;

	if (existsSync(cmsExamplePath)) {
		if (!existsSync(cmsEnvPath)) {
			if (context.dryRun) {
				context.changes.push('.env.cms would be created from .env.cms.example');
				return;
			}
			copyFileSync(cmsExamplePath, cmsEnvPath);
			context.changes.push('.env.cms created from .env.cms.example');
			return;
		}

		if (context.dryRun) {
			context.changes.push('.env.cms would be updated from .env.cms.example');
			return;
		}

		mergeEnvExampleIntoFile(context, cmsEnvPath, cmsExamplePath);
		context.changes.push('.env.cms updated from .env.cms.example');
		return;
	}

	if (existsSync(legacyEnvPath)) {
		if (context.dryRun) {
			context.changes.push('.env.cms would be created from .env');
			return;
		}
		copyFileSync(legacyEnvPath, cmsEnvPath);
		context.changes.push('.env.cms created from .env');
	}
}

function mergeEnvExampleIntoFile(context, envPath, examplePath) {
	const current = existsSync(envPath) ? readEnvFile(envPath) : {};
	const example = readEnvFile(examplePath);
	const merged = { ...example };
	for (const [key, value] of Object.entries(current)) {
		if (present(value)) merged[key] = value;
	}
	write(context, envPath, formatEnvFile(merged));
}

function formatEnvFile(values) {
	return `${Object.entries(values)
		.map(([key, value]) => `${key}=${formatEnvValue(value)}`)
		.join('\n')}\n`;
}

function formatEnvValue(value) {
	if (value === '') return '""';
	if (/[\s#"'=]/.test(value)) return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	return value;
}

function present(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

async function resetPassword(argv) {
	const options = parseResetPasswordArgs(argv);
	if (options.password && options.passwordStdin) {
		throw new Error('Use either --password or --password-stdin, not both');
	}

	const email = options.email || (await prompt('Email: ')).trim().toLowerCase();
	if (!email) throw new Error('Email is required');

	const isInteractivePassword = !options.passwordStdin && !options.password;
	const password = options.passwordStdin
		? await readStdin()
		: options.password || (await promptHidden('New password: '));
	if (!password) throw new Error('reset-password requires --password or --password-stdin');
	if (password.length < 8) throw new Error('Password must be at least 8 characters');
	if (isInteractivePassword) {
		const confirmation = await promptHidden('Confirm password: ');
		if (password !== confirmation) throw new Error('Passwords do not match');
	}

	const databaseUrl = resolveDatabaseUrl(options.cwd);
	const db = new Database(databaseUrl);
	try {
		const user = db.prepare('SELECT id, email FROM "user" WHERE lower(email) = ?').get(email);
		if (!user) throw new Error(`No user found for ${email}`);

		const account = db
			.prepare('SELECT id FROM account WHERE userId = ? AND providerId = ?')
			.get(user.id, 'credential');
		if (!account) throw new Error(`User ${email} has no credential account`);

		const hashed = await hashPassword(password);
		if (!(await verifyPassword({ hash: hashed, password }))) {
			throw new Error('Password hash verification failed');
		}
		db.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(
			hashed,
			new Date().toISOString(),
			account.id
		);
		db.prepare('DELETE FROM session WHERE userId = ?').run(user.id);
		console.log(`Password reset for ${user.email}; existing sessions revoked.`);
	} finally {
		db.close();
	}
}

function assertSvelteKitApp({ cwd }) {
	if (!existsSync(path.join(cwd, 'package.json'))) {
		throw new Error(`No package.json found in ${cwd}`);
	}
	if (!existsSync(path.join(cwd, 'src'))) {
		throw new Error(`No src directory found in ${cwd}`);
	}
}

function read(file) {
	return readFileSync(file, 'utf-8');
}

async function readStdin() {
	let value = '';
	for await (const chunk of process.stdin) value += chunk;
	return value.trimEnd();
}

async function prompt(message) {
	if (!process.stdin.isTTY) throw new Error(`Missing value for prompt "${message.trim()}"`);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	try {
		return await new Promise((resolve) => {
			rl.question(message, resolve);
		});
	} finally {
		rl.close();
	}
}

async function promptHidden(message) {
	if (!process.stdin.isTTY) throw new Error(`Missing value for prompt "${message.trim()}"`);

	const silentOutput = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		}
	});

	process.stdout.write(message);
	const rl = readline.createInterface({
		input: process.stdin,
		output: silentOutput,
		terminal: true
	});

	try {
		const answer = await new Promise((resolve) => {
			rl.question('', resolve);
		});
		process.stdout.write('\n');
		return answer;
	} finally {
		rl.close();
	}
}

function resolveDatabaseUrl(cwd) {
	const env = readEnvFile(path.join(cwd, '.env'));
	const value = process.env.DATABASE_URL || env.DATABASE_URL || 'data/brixter.db';
	return path.isAbsolute(value) ? value : path.join(cwd, value);
}

function readEnvFile(file) {
	if (!existsSync(file)) return {};

	const env = {};
	const lines = read(file).split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.trimStart().startsWith('#')) continue;

		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;

		let value = match[2].trim();
		if (value.startsWith('"')) {
			value = value.slice(1);
			while (!value.endsWith('"') && i < lines.length - 1) {
				i++;
				value += `\n${lines[i]}`;
			}
			if (value.endsWith('"')) value = value.slice(0, -1);
			value = value.replace(/\\n/g, '\n');
		}
		env[match[1]] = value;
	}

	return env;
}

function write(context, file, contents) {
	if (!context.dryRun) {
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
}

function createFile(context, relativePath, contents) {
	const file = path.join(context.cwd, relativePath);
	if (existsSync(file)) {
		if (read(file) === contents) {
			context.skipped.push(`${relativePath} already configured`);
			return;
		}
		context.manual.push(`${relativePath} already exists; review before changing it`);
		return;
	}

	write(context, file, contents);
	context.changes.push(relativePath);
}

function ensureRouteShims(context, routesRoot = 'src/routes') {
	createFile(
		context,
		`${routesRoot}/__brixter/[...path]/+page.server.ts`,
		"export { actions, load } from 'brixter/sveltekit/server';\n"
	);
	createFile(
		context,
		`${routesRoot}/__brixter/[...path]/+page.svelte`,
		`<script lang="ts">
	import Brixter from 'brixter/sveltekit';

	let { data, form } = $props();
</script>

<Brixter {data} {form} />
`
	);
	createFile(
		context,
		`${routesRoot}/__brixter/api/[...api]/+server.ts`,
		"export { GET, POST } from 'brixter/sveltekit/api';\n"
	);
}

function ensureBrixterLayout(context, routesRoot = 'src/routes') {
	const layoutContents = `<script lang="ts">
	import 'brixter/styles.css';

	let { children } = $props();
</script>

{@render children()}
`;
	const layoutAtPath = `${routesRoot}/__brixter/+layout@.svelte`;
	const legacyLayoutPath = `${routesRoot}/__brixter/+layout.svelte`;
	const legacyFile = path.join(context.cwd, legacyLayoutPath);
	const layoutAtFile = path.join(context.cwd, layoutAtPath);

	if (existsSync(legacyFile) && !existsSync(layoutAtFile)) {
		if (context.dryRun) {
			context.changes.push(`${legacyLayoutPath} → ${layoutAtPath}`);
		} else {
			renameSync(legacyFile, layoutAtFile);
			context.changes.push(`${legacyLayoutPath} → ${layoutAtPath}`);
		}
		return;
	}

	if (existsSync(legacyFile) && existsSync(layoutAtFile) && !context.dryRun) {
		rmSync(legacyFile, { force: true });
		context.changes.push(`removed legacy ${legacyLayoutPath}`);
	}

	createFile(context, layoutAtPath, layoutContents);
}

function ensureHooks(context) {
	ensureClientHooks(context);
	ensureServerHooks(context);
}

function ensureClientHooks(context) {
	const relativePath = 'src/hooks.ts';
	const file = path.join(context.cwd, relativePath);
	const brixterExport = "export { reroute } from 'brixter/sveltekit';\n";

	if (!existsSync(file)) {
		write(context, file, brixterExport);
		context.changes.push(relativePath);
		return;
	}

	const contents = read(file);
	if (contents.includes('brixter/sveltekit')) {
		context.skipped.push(`${relativePath} already uses brixter reroute`);
		return;
	}

	if (!/\breroute\b/.test(contents.trim())) {
		write(context, file, `${contents.trimEnd()}\n\n${brixterExport}`);
		context.changes.push(`${relativePath} appended brixter reroute`);
		return;
	}

	context.manual.push(
		`${relativePath} already defines reroute; compose it with reroute from 'brixter/sveltekit'`
	);
}

function ensureServerHooks(context) {
	const relativePath = 'src/hooks.server.ts';
	const file = path.join(context.cwd, relativePath);
	const defaultContents = `import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
`;

	if (!existsSync(file)) {
		write(context, file, defaultContents);
		context.changes.push(relativePath);
		return;
	}

	let contents = read(file);
	if (contents.includes('brixter/server')) {
		context.skipped.push(`${relativePath} already uses brixter handle`);
		return;
	}

	if (!contents.includes("from '@sveltejs/kit/hooks'")) {
		contents = `import { sequence } from '@sveltejs/kit/hooks';\n${contents}`;
	}
	if (!contents.includes("from 'brixter/server'")) {
		contents = `import { handle as brixterHandle } from 'brixter/server';\n${contents}`;
	}

	const sequenceMatch = contents.match(/export\s+const\s+handle\s*=\s*sequence\(([^)]*)\)/s);
	if (sequenceMatch) {
		const currentHandles = sequenceMatch[1].trim();
		const nextHandles = currentHandles ? `${currentHandles}, brixterHandle` : 'brixterHandle';
		contents = contents.replace(sequenceMatch[0], `export const handle = sequence(${nextHandles})`);
		write(context, file, contents);
		context.changes.push(`${relativePath} appended brixter handle`);
		return;
	}

	if (!/\bhandle\b/.test(contents)) {
		write(
			context,
			file,
			`${contents.trimEnd()}\n\nexport const handle = sequence(brixterHandle);\n`
		);
		context.changes.push(`${relativePath} added brixter handle`);
		return;
	}

	context.manual.push(
		`${relativePath} already defines handle; compose it with handle from 'brixter/server'`
	);
}

function ensureVitePlugin(context, pluginOptions = {}) {
	const relativePath = findFirst(context.cwd, ['vite.config.ts', 'vite.config.js']);
	if (!relativePath) {
		context.manual.push("vite config not found; add brixter() from 'brixter/vite' to plugins");
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes('brixter/vite')) {
		context.skipped.push(`${relativePath} already uses brixter vite plugin`);
		return;
	}

	if (!/plugins\s*:\s*\[/.test(contents)) {
		context.manual.push(`${relativePath} has no simple plugins array; add brixter() manually`);
		return;
	}

	const brixterOptions = [`adminPath: '${context.adminPath}'`];
	if (pluginOptions.appRoot) {
		brixterOptions.push(`appRoot: '${pluginOptions.appRoot}'`);
	}

	contents = addImport(contents, "import { brixter } from 'brixter/vite';");
	contents = contents.replace(
		/plugins\s*:\s*\[/,
		`plugins: [brixter({ ${brixterOptions.join(', ')} }), `
	);
	write(context, file, contents);
	context.changes.push(`${relativePath} added brixter vite plugin`);
}

function ensureVariantViteEnvLoader(context) {
	const relativePath = findFirst(context.cwd, ['vite.config.ts', 'vite.config.js']);
	if (!relativePath) {
		context.manual.push(
			'vite config not found; BRIXTER_VARIANT=cms must read .env.cms at dev time (see brixter README)'
		);
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes('brixter-load-variant-env')) {
		context.skipped.push(`${relativePath} already loads variant env for vite`);
		return;
	}

	const snippet = `// brixter-load-variant-env — loads .env.cms / .env.site when BRIXTER_VARIANT is set
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(function loadBrixterVariantEnv() {
	const variant = process.env.BRIXTER_VARIANT;
	const envFile =
		variant === 'cms' ? '.env.cms' : variant === 'site' ? '.env.site' : null;
	if (!envFile) return;
	const envPath = resolve(process.cwd(), envFile);
	if (!existsSync(envPath)) return;
	for (const line of readFileSync(envPath, 'utf-8').split(/\\r?\\n/)) {
		if (!line || line.trimStart().startsWith('#')) continue;
		const match = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
		process.env[match[1]] = value;
	}
})();

`;

	write(context, file, snippet + contents);
	context.changes.push(`${relativePath} loads variant env (.env.cms / .env.site) for vite`);
}

function ensureSvelteExtensions(context) {
	const relativePath = findFirst(context.cwd, ['svelte.config.js', 'svelte.config.ts']);
	if (!relativePath) {
		context.manual.push(
			"svelte config not found; add '.brix.yaml' and '.brix.yml' to config.extensions"
		);
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes("'.brix.yaml'") && contents.includes("'.brix.yml'")) {
		context.skipped.push(`${relativePath} already enables brix yaml extensions`);
		return;
	}

	const extensionsMatch = contents.match(/extensions\s*:\s*\[([^\]]*)\]/s);
	if (extensionsMatch) {
		const current = extensionsMatch[1];
		const additions = [];
		if (!current.includes("'.brix.yaml'") && !current.includes('".brix.yaml"')) {
			additions.push("'.brix.yaml'");
		}
		if (!current.includes("'.brix.yml'") && !current.includes('".brix.yml"')) {
			additions.push("'.brix.yml'");
		}
		if (additions.length === 0) {
			context.skipped.push(`${relativePath} already enables brix yaml extensions`);
			return;
		}

		const separator = current.trim() ? ', ' : '';
		contents = contents.replace(
			extensionsMatch[0],
			`extensions: [${current}${separator}${additions.join(', ')}]`
		);
		write(context, file, contents);
		context.changes.push(`${relativePath} added brix yaml extensions`);
		return;
	}

	if (/const\s+config\s*=\s*\{/.test(contents)) {
		contents = contents.replace(
			/const\s+config\s*=\s*\{/,
			`const config = {\n\textensions: ['.svelte', '.brix.yaml', '.brix.yml'],`
		);
		write(context, file, contents);
		context.changes.push(`${relativePath} added brix yaml extensions`);
		return;
	}

	context.manual.push(
		`${relativePath} has no simple config object; add brix yaml extensions manually`
	);
}

function ensureEnvExample(context) {
	ensureEnvEntries(context, '.env.example', embeddedEnvEntries());
}

function ensureFlatSiteRoutes(context, routesRoot = 'src/routes-site') {
	const routesDir = path.join(context.cwd, routesRoot);

	if (!existsSync(routesDir)) {
		if (context.dryRun) {
			context.changes.push(`${routesRoot}/ (would create route tree)`);
		} else {
			mkdirSync(routesDir, { recursive: true });
			context.changes.push(`${routesRoot}/ (created route tree)`);
		}
	}

	flattenSiteRouteGroup(context, routesRoot);
	ensureSiteRootLayout(context, routesRoot);
	ensureSiteLayoutCss(context, routesRoot);
}

function flattenSiteRouteGroup(context, routesRoot = 'src/routes-site') {
	const siteGroupDir = path.join(context.cwd, routesRoot, '(site)');
	if (!existsSync(siteGroupDir)) return;

	const siteLayout = path.join(siteGroupDir, '+layout.svelte');
	if (existsSync(siteLayout)) {
		context.manual.push(
			`merge ${routesRoot}/(site)/+layout.svelte into ${routesRoot}/+layout.svelte, then remove the (site) group`
		);
	}

	for (const entry of readdirSync(siteGroupDir, { withFileTypes: true })) {
		if (entry.name === '+layout.svelte') continue;
		moveFlatRouteEntry(context, siteGroupDir, entry.name, routesRoot);
	}

	if (context.dryRun) return;

	const remaining = readdirSync(siteGroupDir).filter((name) => name !== '+layout.svelte');
	if (remaining.length === 0) {
		try {
			rmSync(siteGroupDir, { recursive: true, force: true });
			context.changes.push(`removed empty ${routesRoot}/(site)`);
		} catch {
			context.manual.push(`remove ${routesRoot}/(site) after flattening`);
		}
	}
}

function moveFlatRouteEntry(context, fromDir, name, routesRoot) {
	const from = path.join(fromDir, name);
	const to = path.join(context.cwd, routesRoot, name);
	const displayFrom = `${routesRoot}/(site)/${name}`;
	const displayTo = `${routesRoot}/${name}`;

	if (existsSync(to)) {
		context.skipped.push(`${displayTo} already exists`);
		return;
	}

	if (context.dryRun) {
		context.changes.push(`move ${displayFrom} → ${displayTo}`);
		return;
	}

	mkdirSync(path.dirname(to), { recursive: true });
	renameSync(from, to);
	context.changes.push(`moved ${displayFrom} → ${displayTo}`);
}

function ensureSiteRootLayout(context, routesRoot = 'src/routes-site') {
	const relativePath = `${routesRoot}/+layout.svelte`;
	createFile(
		context,
		relativePath,
		`<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<!-- Site chrome (navbar, footer, etc.) -->
{@render children()}
`
	);
}

function ensureSiteLayoutCss(context, routesRoot = 'src/routes-site') {
	const relativePath = `${routesRoot}/layout.css`;
	createFile(
		context,
		relativePath,
		`@import 'tailwindcss';
@plugin '@tailwindcss/typography';
`
	);
}

function ensureSiteRouteGroup(context, routesRoot = 'src/routes') {
	const siteGroupRelative = `${routesRoot}/(site)`;
	createFile(
		context,
		`${siteGroupRelative}/+layout.svelte`,
		defaultSiteGroupLayoutContents()
	);

	const routesDir = path.join(context.cwd, routesRoot);
	if (!existsSync(routesDir)) {
		if (context.dryRun) {
			context.changes.push(`${routesRoot}/ (would create route tree)`);
		} else {
			mkdirSync(routesDir, { recursive: true });
			context.changes.push(`${routesRoot}/ (created route tree)`);
		}
	}

	if (!existsSync(routesDir)) return;

	for (const entry of readdirSync(routesDir, { withFileTypes: true })) {
		if (isReservedRouteEntry(entry.name)) continue;
		moveRouteEntry(context, routesDir, entry.name, siteGroupRelative, routesRoot);
	}

	ensureMinimalRootLayout(context, routesRoot);
}

function passThroughRootLayoutContents() {
	return `<script lang="ts">
	let { children } = $props();
</script>

{@render children()}
`;
}

function defaultSiteGroupLayoutContents() {
	return `<script lang="ts">
	import '../layout.css';

	let { children } = $props();
</script>

<!-- Site chrome (navbar, footer, etc.) -->
{@render children()}
`;
}

function isInitSiteGroupLayout(contents) {
	return (
		contents.includes('Site chrome') &&
		contents.includes('{@render children()}') &&
		!contents.includes('layout.css')
	);
}

function promoteSiteChromeToRouteGroup(context, routesRoot = 'src/routes') {
	const rootLayoutPath = path.join(context.cwd, routesRoot, '+layout.svelte');
	const siteLayoutPath = path.join(context.cwd, routesRoot, '(site)', '+layout.svelte');
	if (!existsSync(rootLayoutPath)) return;

	const rootContents = read(rootLayoutPath);
	if (isPassThroughRootLayout(rootContents)) {
		context.skipped.push(`${routesRoot}/+layout.svelte already pass-through`);
		return;
	}

	const siteRelative = `${routesRoot}/(site)/+layout.svelte`;
	const siteContents = existsSync(siteLayoutPath) ? read(siteLayoutPath) : '';
	const siteIsPlaceholder = !siteContents || isInitSiteGroupLayout(siteContents);

	if (!siteIsPlaceholder) {
		context.manual.push(
			`keep ${routesRoot}/+layout.svelte minimal (global CSS only) and move site chrome into ${siteRelative}`
		);
		return;
	}

	if (context.dryRun) {
		context.changes.push(
			`would move site chrome from ${routesRoot}/+layout.svelte → ${siteRelative} and reset root layout`
		);
		return;
	}

	mkdirSync(path.dirname(siteLayoutPath), { recursive: true });
	write(context, siteRelative, rootContents);
	write(context, `${routesRoot}/+layout.svelte`, passThroughRootLayoutContents());
	context.changes.push(`moved site chrome into ${siteRelative}`);
	context.changes.push(`${routesRoot}/+layout.svelte reset to pass-through root layout`);
}

function finalizeRootLayoutIsolation(context, routesRoot = 'src/routes') {
	const rootRelative = `${routesRoot}/+layout.svelte`;
	const siteRelative = `${routesRoot}/(site)/+layout.svelte`;
	const rootPath = path.join(context.cwd, rootRelative);
	const sitePath = path.join(context.cwd, siteRelative);
	if (!existsSync(rootPath)) return;

	const rootContents = read(rootPath);
	if (isPassThroughRootLayout(rootContents)) {
		context.skipped.push(`${rootRelative} already pass-through (CMS isolated from site styles)`);
		return;
	}

	const siteContents = existsSync(sitePath) ? read(sitePath) : defaultSiteGroupLayoutContents();
	const mergedSiteLayout = mergeSiteLayoutWithRootGlobals(rootContents, siteContents);

	if (context.dryRun) {
		context.changes.push(
			`would move global site imports from ${rootRelative} → ${siteRelative} and reset root to pass-through`
		);
		return;
	}

	mkdirSync(path.dirname(sitePath), { recursive: true });
	write(context, siteRelative, mergedSiteLayout);
	write(context, rootRelative, passThroughRootLayoutContents());
	context.changes.push(`moved global site imports into ${siteRelative}`);
	context.changes.push(`${rootRelative} reset to pass-through for CMS isolation`);
}

function mergeSiteLayoutWithRootGlobals(rootContents, siteContents) {
	let site = siteContents;
	const scriptMatch = site.match(/<script[^>]*>([\s\S]*?)<\/script>/);
	const rootScriptMatch = rootContents.match(/<script[^>]*>([\s\S]*?)<\/script>/);
	const rootScript = rootScriptMatch?.[1] ?? '';

	for (const line of rootScript.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('import ')) continue;
		if (!/layout\.css|favicon|\.svg/.test(trimmed)) continue;
		if (site.includes(trimmed)) continue;
		if (scriptMatch) {
			site = site.replace(scriptMatch[0], scriptMatch[0].replace(/<\/script>/, `\t${line}\n</script>`));
		}
	}

	const headBlocks = rootContents.match(/<svelte:head>[\s\S]*?<\/svelte:head>/g) ?? [];
	for (const block of headBlocks) {
		if (!site.includes(block)) {
			const renderIndex = site.indexOf('{@render children()}');
			if (renderIndex === -1) {
				site += `\n${block}\n`;
			} else {
				site = `${site.slice(0, renderIndex)}${block}\n${site.slice(renderIndex)}`;
			}
		}
	}

	return site;
}

function isReservedRouteEntry(name) {
	if (name === '(site)' || name === '__brixter') return true;
	if (name === 'layout.css') return true;
	if (name.startsWith('+layout')) return true;
	return false;
}

function moveRouteEntry(context, routesDir, name, siteGroupRelative, routesRoot = 'src/routes') {
	const from = path.join(routesDir, name);
	const to = path.join(routesDir, '(site)', name);
	const displayFrom = `${routesRoot}/${name}`;
	const displayTo = `${siteGroupRelative}/${name}`;

	if (existsSync(to)) {
		context.skipped.push(`${displayTo} already exists`);
		return;
	}

	if (context.dryRun) {
		context.changes.push(`move ${displayFrom} → ${displayTo}`);
		return;
	}

	mkdirSync(path.dirname(to), { recursive: true });
	renameSync(from, to);
	context.changes.push(`moved ${displayFrom} → ${displayTo}`);
}

function ensureMinimalRootLayout(context, routesRoot = 'src/routes') {
	const relativePath = `${routesRoot}/+layout.svelte`;
	const file = path.join(context.cwd, relativePath);
	if (!existsSync(file)) {
		createFile(context, relativePath, passThroughRootLayoutContents());
		return;
	}

	const contents = read(file);
	if (isPassThroughRootLayout(contents)) {
		context.skipped.push(`${relativePath} already pass-through`);
		return;
	}

	if (isMinimalRootLayout(contents)) {
		context.manual.push(
			`move site-only imports (layout.css, favicon, chrome) from ${relativePath} into ${routesRoot}/(site)/+layout.svelte — root must stay pass-through so /admin does not inherit site styles`
		);
		return;
	}

	context.manual.push(
		`keep ${relativePath} pass-through only and move site chrome into ${routesRoot}/(site)/+layout.svelte`
	);
}

function isPassThroughRootLayout(contents) {
	if (!contents.includes('{@render children()}')) return false;
	if (/layout\.css/.test(contents)) return false;
	if (/favicon/i.test(contents) || /\$lib\/assets\//.test(contents)) return false;
	return true;
}

function isMinimalRootLayout(contents) {
	if (!isPassThroughRootLayout(contents) && contents.includes('{@render children()}')) {
		const withoutComments = contents.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '');
		const lines = withoutComments
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		return lines.length <= 14;
	}
	return isPassThroughRootLayout(contents);
}

function resolveGitRepoRoot(cwd) {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
		cwd,
		encoding: 'utf-8'
	});
	if (result.status === 0) return result.stdout.trim();
	return cwd;
}

function resolveSiteRoutesRoot(context) {
	const repoRoot = resolveGitRepoRoot(context.cwd);
	const siteRoutesDir = path.join(context.cwd, 'src/routes-site');
	return path.relative(repoRoot, siteRoutesDir).split(path.sep).join('/') || 'src/routes-site';
}

function migrateLegacyRoutesToVariants(context) {
	const legacyDir = path.join(context.cwd, 'src/routes');
	const siteDir = path.join(context.cwd, 'src/routes-site');
	const cmsDir = path.join(context.cwd, 'src/routes-cms');

	if (!existsSync(legacyDir)) return;

	if (!context.dryRun) {
		mkdirSync(siteDir, { recursive: true });
		mkdirSync(cmsDir, { recursive: true });
	}

	const legacyEntries = readdirSync(legacyDir, { withFileTypes: true });
	if (legacyEntries.length === 0) return;

	for (const entry of legacyEntries) {
		const name = entry.name;
		if (name === '__brixter') {
			movePath(context, path.join(legacyDir, name), path.join(cmsDir, name), 'src/routes/__brixter', 'src/routes-cms/__brixter');
			continue;
		}
		if (name === '(site)') {
			const siteGroupPath = path.join(legacyDir, name);
			for (const child of readdirSync(siteGroupPath)) {
				if (child === '+layout.svelte') continue;
				movePath(
					context,
					path.join(siteGroupPath, child),
					path.join(siteDir, child),
					`src/routes/(site)/${child}`,
					`src/routes-site/${child}`
				);
			}
			continue;
		}
		if (isReservedRouteEntry(name)) {
			movePath(
				context,
				path.join(legacyDir, name),
				path.join(siteDir, name),
				`src/routes/${name}`,
				`src/routes-site/${name}`
			);
			continue;
		}
		movePath(
			context,
			path.join(legacyDir, name),
			path.join(siteDir, name),
			`src/routes/${name}`,
			`src/routes-site/${name}`
		);
	}

	const remaining = existsSync(legacyDir) ? readdirSync(legacyDir) : [];
	if (remaining.length === 0 && !context.dryRun && existsSync(legacyDir)) {
		try {
			renameSync(legacyDir, path.join(context.cwd, 'src/routes.legacy.brixter'));
			context.changes.push('renamed empty src/routes → src/routes.legacy.brixter');
		} catch {
			context.manual.push('remove or archive src/routes now that variants use src/routes-site and src/routes-cms');
		}
	} else if (remaining.length > 0) {
		context.manual.push('review remaining files in src/routes after variant migration');
	}
}

function movePath(context, from, to, displayFrom, displayTo) {
	if (existsSync(to)) {
		context.skipped.push(`${displayTo} already exists`);
		return;
	}
	if (!existsSync(from)) return;

	if (context.dryRun) {
		context.changes.push(`move ${displayFrom} → ${displayTo}`);
		return;
	}

	mkdirSync(path.dirname(to), { recursive: true });
	renameSync(from, to);
	context.changes.push(`moved ${displayFrom} → ${displayTo}`);
}

function ensureVariantSvelteConfig(context) {
	const relativePath = findFirst(context.cwd, ['svelte.config.js', 'svelte.config.ts']);
	if (!relativePath) {
		context.manual.push('svelte config not found; configure BRIXTER_VARIANT route trees manually');
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes('brixterVariant') && contents.includes('hooks.universal.cms')) {
		context.skipped.push(`${relativePath} already configures BRIXTER_VARIANT route trees`);
		return;
	}

	if (contents.includes('brixterVariant') && !contents.includes('hooks.universal.cms')) {
		contents = contents.replace(
			/server: brixterVariant === 'cms' \? 'src\/hooks\.server\.cms' : 'src\/hooks\.server\.site'\n\t\t\t\}/,
			`server: brixterVariant === 'cms' ? 'src/hooks.server.cms' : 'src/hooks.server.site',\n\t\t\t\tuniversal: brixterVariant === 'cms' ? 'src/hooks.universal.cms' : 'src/hooks.universal.site'\n\t\t\t}`
		);
		if (contents.includes('hooks.universal.cms')) {
			write(context, file, contents);
			context.changes.push(`${relativePath} added universal hooks for BRIXTER_VARIANT`);
			return;
		}
	}

	if (contents.includes('brixterVariant')) {
		context.manual.push(
			`${relativePath} already configures BRIXTER_VARIANT; add hooks.universal.{site,cms} to kit.files.hooks manually`
		);
		return;
	}

	const variantLine =
		"const brixterVariant = process.env.BRIXTER_VARIANT === 'cms' ? 'cms' : 'site';\n";
	contents = addAfterLastImport(contents, variantLine);

	const filesBlock = `\t\tfiles: {
\t\t\troutes: brixterVariant === 'cms' ? 'src/routes-cms' : 'src/routes-site',
\t\t\thooks: {
\t\t\t\tclient: brixterVariant === 'cms' ? 'src/hooks.cms' : 'src/hooks.site',
\t\t\t\tserver: brixterVariant === 'cms' ? 'src/hooks.server.cms' : 'src/hooks.server.site',
\t\t\t\tuniversal: brixterVariant === 'cms' ? 'src/hooks.universal.cms' : 'src/hooks.universal.site'
\t\t\t}
\t\t},\n`;

	if (!/kit:\s*\{/.test(contents)) {
		context.manual.push(`${relativePath} has no kit config; add BRIXTER_VARIANT files block manually`);
		return;
	}

	contents = contents.replace(/kit:\s*\{/, `kit: {\n${filesBlock}`);
	write(context, file, contents);
	context.changes.push(`${relativePath} added BRIXTER_VARIANT route trees`);
}

function ensureVariantHooks(context) {
	createFile(context, 'src/hooks.site.ts', '/** Site variant: no client hooks */\n');
	createFile(context, 'src/hooks.cms.ts', '/** CMS variant: no client hooks */\n');
	createFile(context, 'src/hooks.universal.site.ts', '/** Site variant: no universal hooks */\n');
	createFile(
		context,
		'src/hooks.universal.cms.ts',
		"export { reroute } from 'brixter/sveltekit';\n"
	);
	createFile(
		context,
		'src/hooks.server.site.ts',
		`import type { Handle } from '@sveltejs/kit';

/** Site variant: no auth or CMS middleware */
export const handle: Handle = ({ event, resolve }) => resolve(event);
`
	);
	createFile(
		context,
		'src/hooks.server.cms.ts',
		`import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
`
	);

	archiveLegacyHookFiles(context);
}

function archiveLegacyHookFiles(context) {
	for (const relativePath of ['src/hooks.ts', 'src/hooks.server.ts']) {
		const file = path.join(context.cwd, relativePath);
		if (!existsSync(file)) continue;

		const archivePath = path.join(context.cwd, `${relativePath.replace(/\//g, '.')}.legacy.brixter`);
		if (existsSync(archivePath)) {
			context.skipped.push(`${relativePath} already archived`);
			continue;
		}

		if (context.dryRun) {
			context.changes.push(`${relativePath} → ${path.basename(archivePath)}`);
			continue;
		}

		renameSync(file, archivePath);
		context.changes.push(`archived ${relativePath} → ${path.basename(archivePath)}`);
	}
}

function ensureCmsRootRedirect(context) {
	createFile(
		context,
		'src/routes-cms/+page.server.ts',
		`import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(302, '${context.adminPath}');
};
`
	);
}

function ensureVariantEnvExamples(context) {
	ensureEnvEntries(context, '.env.site.example', siteVariantEnvEntries());
	ensureEnvEntries(context, '.env.cms.example', cmsVariantEnvEntries());
}

function ensureVariantDotEnv(context) {
	ensureDotEnvFromExample(context, '.env.site', '.env.site.example');
	ensureDotEnvFromExample(context, '.env.cms', '.env.cms.example');
}

function siteVariantEnvEntries() {
	return [
		['ORIGIN', '"http://localhost:5173"'],
		['BRIXTER_SOURCE_REPO', '""'],
		['BRIXTER_SOURCE_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_COMMIT', '""']
	];
}

function cmsVariantEnvEntries() {
	return embeddedEnvEntries().map(([key, value]) =>
		key === 'ORIGIN' ? ['ORIGIN', '"http://localhost:5174"'] : [key, value]
	);
}

function ensureVariantPackageScripts(context) {
	const pkgPath = path.join(context.cwd, 'package.json');
	const pkg = JSON.parse(read(pkgPath));
	pkg.scripts ??= {};

	const scripts = {
		'dev:site': 'BRIXTER_VARIANT=site vite dev --port 5173',
		'dev:cms': 'BRIXTER_VARIANT=cms vite dev --port 5174',
		'build:site': 'BRIXTER_VARIANT=site vite build',
		'build:cms': 'BRIXTER_VARIANT=cms vite build',
		'preview:site': 'BRIXTER_VARIANT=site vite preview --port 5173',
		'preview:cms': 'BRIXTER_VARIANT=cms vite preview --port 5174',
		'db:migrate': 'BRIXTER_VARIANT=cms brixter migrate'
	};

	let changed = false;
	for (const [name, command] of Object.entries(scripts)) {
		if (pkg.scripts[name] === command) continue;
		if (pkg.scripts[name] && pkg.scripts[name] !== command && name !== 'db:migrate') {
			context.manual.push(`package.json scripts.${name} already set; expected: ${command}`);
			continue;
		}
		pkg.scripts[name] = command;
		changed = true;
	}

	if (!changed) {
		context.skipped.push('package.json already has brixter variant scripts');
		return;
	}

	if (context.dryRun) {
		context.changes.push('package.json would add brixter variant scripts');
		return;
	}

	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	context.changes.push('package.json added brixter variant scripts');
}

function ensureDockerComposeFiles(context) {
	createFile(
		context,
		'docker-compose.site.yml',
		`services:
  site:
    build:
      context: .
      dockerfile: Dockerfile.brixter
      args:
        BRIXTER_VARIANT: site
    env_file:
      - .env.site
    environment:
      BRIXTER_VARIANT: site
      ORIGIN: \${ORIGIN:-http://localhost:5173}
    ports:
      - '5173:3000'
`
	);
	createFile(
		context,
		'docker-compose.cms.yml',
		`services:
  cms:
    build:
      context: .
      dockerfile: Dockerfile.brixter
      args:
        BRIXTER_VARIANT: cms
    env_file:
      - .env.cms
    environment:
      BRIXTER_VARIANT: cms
      ORIGIN: \${ORIGIN:-http://localhost:5174}
    ports:
      - '5174:3000'
    volumes:
      - ./data:/app/data
`
	);
	createFile(
		context,
		'Dockerfile.brixter',
		`# Brixter variant image — build with BRIXTER_VARIANT=site or cms
FROM node:22-alpine AS build
WORKDIR /app
ARG BRIXTER_VARIANT=site
ENV BRIXTER_VARIANT=\$BRIXTER_VARIANT
COPY package.json package-lock.json* pnpm-lock.yaml* bun.lock* ./
RUN npm install
COPY . .
RUN npm run build:\$BRIXTER_VARIANT

FROM node:22-alpine
WORKDIR /app
ARG BRIXTER_VARIANT=site
ENV BRIXTER_VARIANT=\$BRIXTER_VARIANT
ENV NODE_ENV=production
ENV ORIGIN=http://localhost:3000
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "build"]
`
	);
}

function addAfterLastImport(contents, statement) {
	if (contents.includes(statement.trim())) return contents;
	const importMatches = [...contents.matchAll(/^import .*;$/gm)];
	if (importMatches.length === 0) return `${statement}\n${contents}`;
	const last = importMatches.at(-1);
	const insertAt = last.index + last[0].length;
	return `${contents.slice(0, insertAt)}\n${statement}${contents.slice(insertAt)}`;
}

function ensureDotEnvFromExample(context, envName, exampleName) {
	const envFile = path.join(context.cwd, envName);
	const exampleFile = path.join(context.cwd, exampleName);

	if (existsSync(envFile)) {
		context.skipped.push(`${envName} already exists`);
		return;
	}

	if (!existsSync(exampleFile)) {
		context.manual.push(`create ${envName} from ${exampleName} before starting the app`);
		return;
	}

	if (context.dryRun) {
		context.changes.push(`${envName} would be created from ${exampleName}`);
		return;
	}

	copyFileSync(exampleFile, envFile);
	context.changes.push(`${envName} created from ${exampleName}`);
}

function embeddedEnvEntries() {
	return [
		['DATABASE_URL', 'data/brixter.db'],
		['ORIGIN', '"http://localhost:5173"'],
		['BRIXTER_AUTH_SECRET', '"change-me"'],
		['GITHUB_APP_ID', '""'],
		['GITHUB_PRIVATE_KEY', '""'],
		['GITHUB_INSTALLATION_ID', '""'],
		['GITHUB_REPO_OWNER', '""'],
		['GITHUB_REPO_NAME', '""'],
		['GITHUB_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_REPO', '""'],
		['BRIXTER_SOURCE_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_COMMIT', '""']
	];
}

function ensureEnvEntries(context, relativePath, entries) {
	const file = path.join(context.cwd, relativePath);
	const existing = existsSync(file) ? read(file) : '';
	const missing = entries.filter(([key]) => !new RegExp(`^${key}=`, 'm').test(existing));
	if (missing.length === 0) {
		context.skipped.push(`${relativePath} already documents brixter env vars`);
		return;
	}

	const block = [
		existing.trimEnd(),
		'',
		'# Brixter',
		...missing.map(([key, value]) => `${key}=${value}`),
		''
	]
		.filter(Boolean)
		.join('\n');

	write(context, file, `${block}\n`);
	context.changes.push(`${relativePath} documented brixter env vars`);
}

function ensureDotEnv(context) {
	const relativePath = '.env';
	const envFile = path.join(context.cwd, relativePath);
	const exampleFile = path.join(context.cwd, '.env.example');

	if (existsSync(envFile)) {
		context.skipped.push(`${relativePath} already exists`);
		return;
	}

	if (!existsSync(exampleFile)) {
		context.manual.push(
			`create ${relativePath} with the required Brixter env vars before starting the app`
		);
		return;
	}

	if (context.dryRun) {
		context.changes.push(`${relativePath} would be created from .env.example`);
		return;
	}

	copyFileSync(exampleFile, envFile);
	context.changes.push(`${relativePath} created from .env.example`);
}

function readBrixterPackageVersion() {
	const pkgPath = path.resolve(import.meta.dirname, '../package.json');
	return JSON.parse(read(pkgPath)).version;
}

function detectPackageManager(cwd) {
	if (existsSync(path.join(cwd, 'bun.lock')) || existsSync(path.join(cwd, 'bun.lockb'))) {
		return 'bun';
	}
	if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
	return 'npm';
}

function hasBrixterDependency(pkg) {
	return Boolean(pkg.dependencies?.brixter ?? pkg.devDependencies?.brixter);
}

function findInstalledBrixterPackageJson(cwd) {
	let dir = cwd;
	while (true) {
		const candidate = path.join(dir, 'node_modules/brixter/package.json');
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return '';
}

function ensureBrixterPackage(context) {
	if (context.skipInstall) {
		context.skipped.push('package install skipped (--skip-install)');
		return;
	}

	const pkgPath = path.join(context.cwd, 'package.json');
	const pkg = JSON.parse(read(pkgPath));
	const installedPath = findInstalledBrixterPackageJson(context.cwd);

	if (hasBrixterDependency(pkg) && installedPath) {
		context.skipped.push('brixter is already installed');
		return;
	}

	const version = readBrixterPackageVersion();

	if (!hasBrixterDependency(pkg)) {
		pkg.dependencies ??= {};
		pkg.dependencies.brixter = `^${version}`;
		if (context.dryRun) {
			context.changes.push(`package.json would add brixter@^${version}`);
		} else {
			writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
			context.changes.push(`package.json added brixter@^${version}`);
		}
	} else if (!installedPath) {
		context.skipped.push('package.json already lists brixter');
	}

	if (context.dryRun) {
		context.changes.push(`would run ${detectPackageManager(context.cwd)} install`);
		return;
	}

	runPackageInstall(context);
}

function runPackageInstall(context) {
	const pm = detectPackageManager(context.cwd);
	const args =
		pm === 'bun'
			? ['install']
			: pm === 'pnpm'
				? ['install']
				: pm === 'yarn'
					? ['install']
					: ['install'];
	const command = pm === 'npm' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : pm;
	const result = spawnSync(command, args, {
		cwd: context.cwd,
		stdio: 'inherit',
		env: process.env
	});

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed`);
	}

	context.changes.push(`ran ${command} ${args.join(' ')}`);
}

function loadEnvIntoProcess(cwd) {
	loadEnvFileIntoProcess(path.join(cwd, '.env'));
}

function loadEnvFileIntoProcess(file) {
	if (!existsSync(file)) return;
	const env = readEnvFile(file);
	for (const [key, value] of Object.entries(env)) {
		if (process.env[key] !== undefined) continue;
		if (key === 'DATABASE_URL' && !present(value)) continue;
		process.env[key] = value;
	}
}

function loadEnvForProject(cwd) {
	const variant = process.env.BRIXTER_VARIANT;
	const cmsEnv = path.join(cwd, '.env.cms');
	const cmsExample = path.join(cwd, '.env.cms.example');
	const siteEnv = path.join(cwd, '.env.site');
	const legacyEnv = path.join(cwd, '.env');

	if (variant === 'cms') {
		if (existsSync(cmsEnv)) {
			loadEnvFileIntoProcess(cmsEnv);
			return;
		}
		if (existsSync(cmsExample)) {
			loadEnvFileIntoProcess(cmsExample);
			return;
		}
	}

	if (variant === 'site' && existsSync(siteEnv)) {
		loadEnvFileIntoProcess(siteEnv);
		return;
	}

	if (existsSync(legacyEnv)) {
		loadEnvIntoProcess(cwd);
	}
}

async function resolveMigrateModule() {
	const dist = path.resolve(import.meta.dirname, '../dist/server/migrate.js');
	const source = path.resolve(import.meta.dirname, '../src/lib/server/migrate.ts');
	const target = existsSync(dist) ? dist : source;
	return pathToFileURL(target).href;
}

async function runMigrations({ cwd }) {
	if (existsSync(path.join(cwd, '.env.cms')) || existsSync(path.join(cwd, '.env.cms.example'))) {
		process.env.BRIXTER_VARIANT ??= 'cms';
	}
	loadEnvForProject(cwd);
	const { migrate } = await import(await resolveMigrateModule());
	await migrate({ cwd });
}

async function setupDatabase(context) {
	if (context.skipMigrate) {
		context.skipped.push('database setup skipped (--skip-migrate)');
		return;
	}

	if (context.dryRun) {
		context.changes.push('would run Better Auth and brixter database migrations (.env.cms for split layout)');
		return;
	}

	if (!findInstalledBrixterPackageJson(context.cwd)) {
		throw new Error('brixter is not installed in node_modules; run init without --skip-install first');
	}

	if (context.layout === 'split') {
		ensureCmsEnvForMigrate(context);
		process.env.BRIXTER_VARIANT = 'cms';
	}

	loadEnvForProject(context.cwd);

	console.log(
		context.layout === 'split'
			? '▶  Running CMS database migrations (.env.cms)…'
			: '▶  Running database migrations…'
	);

	const { migrate } = await import(await resolveMigrateModule());
	await migrate({ cwd: context.cwd });
	context.changes.push('database migrations applied (Better Auth + brixter)');
}

function findFirst(cwd, candidates) {
	return candidates.find((candidate) => existsSync(path.join(cwd, candidate)));
}

function addImport(contents, statement) {
	if (contents.includes(statement)) return contents;
	const importMatches = [...contents.matchAll(/^import .*;$/gm)];
	if (importMatches.length === 0) return `${statement}\n${contents}`;
	const last = importMatches.at(-1);
	const insertAt = last.index + last[0].length;
	return `${contents.slice(0, insertAt)}\n${statement}${contents.slice(insertAt)}`;
}

function addIconPack(context, packName) {
	if (packName === 'none') return;
	if (packName !== 'lucide') {
		throw new Error(`Unsupported icon pack: ${packName}`);
	}

	const relativeTargetDir = `src/lib/brixter/icons/${packName}`;
	const targetDir = path.join(context.cwd, relativeTargetDir);

	if (existsSync(targetDir)) {
		context.skipped.push(`${relativeTargetDir} directory already configured`);
		return;
	}

	let sourceDir = '';
	try {
		const resolved = import.meta.resolve('lucide-static/package.json');
		const pkgPath = fileURLToPath(resolved);
		sourceDir = path.join(path.dirname(pkgPath), 'icons');
	} catch (e) {
		try {
			const resolved = import.meta.resolve('lucide-static');
			const pkgPath = fileURLToPath(resolved);
			const mainDir = path.dirname(pkgPath);
			if (existsSync(path.join(mainDir, '../../icons'))) {
				sourceDir = path.join(mainDir, '../../icons');
			} else if (existsSync(path.join(mainDir, 'icons'))) {
				sourceDir = path.join(mainDir, 'icons');
			} else if (existsSync(path.join(mainDir, '../icons'))) {
				sourceDir = path.join(mainDir, '../icons');
			}
		} catch (innerErr) {
			sourceDir = path.resolve(import.meta.dirname, '../node_modules/lucide-static/icons');
			if (!existsSync(sourceDir)) {
				sourceDir = path.resolve(import.meta.dirname, '../../../../node_modules/lucide-static/icons');
			}
		}
	}

	if (!existsSync(sourceDir)) {
		throw new Error(`Could not find lucide-static source icons directory at ${sourceDir}`);
	}

	if (!context.dryRun) {
		mkdirSync(targetDir, { recursive: true });
		const files = readdirSync(sourceDir);
		for (const file of files) {
			if (file.endsWith('.svg')) {
				copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
			}
		}
	}

	context.changes.push(`${relativeTargetDir} (copied all Lucide SVG icons)`);
}
