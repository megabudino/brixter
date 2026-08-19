import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

// The published `@brixter/core` exports resolve to built `dist`. In this monorepo
// the specs run straight from TypeScript source, so alias the package and each
// of its subpaths to source — the same seam the site's svelte.config uses —
// avoiding a build step before `vitest`.
export default defineConfig({
	resolve: {
		alias: {
			'@brixter/core/template': fromRoot('./packages/core/template/index.ts'),
			'@brixter/core/schema': fromRoot('./packages/core/schema/index.ts'),
			'@brixter/core/page': fromRoot('./packages/core/page/index.ts'),
			'@brixter/core/sitemap': fromRoot('./packages/core/sitemap/index.ts'),
			'@brixter/core/redirects': fromRoot('./packages/core/redirects/index.ts'),
			'@brixter/core': fromRoot('./packages/core/index.ts')
		}
	}
});
