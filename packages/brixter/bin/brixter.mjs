#!/usr/bin/env node
/**
 * Brixter CLI.
 *
 * Three command groups: `check` validates every page against the schemas its
 * briks infer, `types` writes the generated declarations, and `skills` installs
 * the Brixter agent skills into a project. See `./skills-install.mjs` for the
 * skills adapter layer.
 */
import process from 'node:process';
import { checkProject, generateProjectTypes } from '../dist/cli/check.js';
import { installSkills, listSkills, skillsStatus } from './skills-install.mjs';

// Piping into `head` closes stdout early; that is not an error worth a stack trace.
process.stdout.on('error', (error) => {
	if (error.code === 'EPIPE') process.exit(0);
	throw error;
});

const USAGE = `brixter — CLI for Brixter projects

Usage
  brixter check                      Validate every page against its briks' inferred schemas
  brixter types                      Write TypeScript declarations for the briks on disk
  brixter skills install [options]   Install the Brixter agent skills into this project
  brixter skills list                List the available skills and their targets
  brixter skills status              Show which skills are installed and whether they are stale

Options for \`check\` and \`types\`
  --dir <path>     Project root. Defaults to the current directory.
  --out <path>     Where \`types\` writes its declarations.
                   Defaults to \`src/lib/brixter/brixter.generated.d.ts\`.

Options for \`skills install\`
  --agent <list>   Comma-separated targets: claude, cursor, copilot, windsurf, agents.
                   Defaults to the agents detected in the project, plus \`agents\`
                   (AGENTS.md), which every agent can read. Use \`all\` for every target.
  --dir <path>     Project root to install into. Defaults to the current directory.
  --global         Install into the user-level directory instead of the project.
                   Only \`claude\` supports this; other targets are project-scoped.
  --force          Overwrite files that were modified after installation.
  --dry-run        Print what would be written without writing anything.
  -h, --help       Show this help.
`;

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			if (arg === '-h') flags.help = true;
			else positional.push(arg);
			continue;
		}
		const [key, inlineValue] = splitFlag(arg.slice(2));
		if (key === 'agent' || key === 'dir' || key === 'out') {
			flags[key] = inlineValue ?? argv[++i];
		} else {
			flags[key] = true;
		}
	}
	return { positional, flags };
}

function splitFlag(raw) {
	const eq = raw.indexOf('=');
	return eq === -1 ? [raw, undefined] : [raw.slice(0, eq), raw.slice(eq + 1)];
}

function plural(count, word) {
	return count === 1 ? word : `${word}s`;
}

const { positional, flags } = parseArgs(process.argv.slice(2));

if (flags.help || positional.length === 0) {
	process.stdout.write(USAGE);
	process.exit(positional.length === 0 && !flags.help ? 1 : 0);
}

const [group, command = 'install'] = positional;

if (group !== 'skills' && group !== 'check' && group !== 'types') {
	process.stderr.write(`brixter: unknown command "${group}"\n\n${USAGE}`);
	process.exit(1);
}

try {
	if (group === 'check') {
		const { issues, pages, briks } = checkProject({ root: flags.dir ?? process.cwd() });
		for (const issue of issues) process.stderr.write(`  • ${issue.message}\n`);
		const counted = `${pages} ${plural(pages, 'page')}, ${briks} ${plural(briks, 'brik')}`;
		if (issues.length === 0) {
			process.stdout.write(`brixter: ${counted} — no problems found.\n`);
		} else {
			process.stderr.write(
				`\nbrixter: ${issues.length} ${plural(issues.length, 'problem')} in ${counted}.\n`
			);
			process.exit(1);
		}
	} else if (group === 'types') {
		const written = generateProjectTypes({ root: flags.dir ?? process.cwd(), out: flags.out });
		process.stdout.write(`brixter: wrote ${written}\n`);
	} else if (command === 'install') {
		await installSkills({
			cwd: flags.dir ?? process.cwd(),
			agents: flags.agent,
			global: Boolean(flags.global),
			force: Boolean(flags.force),
			dryRun: Boolean(flags['dry-run'])
		});
	} else if (command === 'list') {
		await listSkills();
	} else if (command === 'status') {
		await skillsStatus({ cwd: flags.dir ?? process.cwd(), global: Boolean(flags.global) });
	} else {
		process.stderr.write(`brixter: unknown "skills" command "${command}"\n\n${USAGE}`);
		process.exit(1);
	}
} catch (error) {
	process.stderr.write(`brixter: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
}
