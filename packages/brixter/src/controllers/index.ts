// virtual.d.ts only declares the ambient `virtual:brixter/controllers` module.
// Importing it would make this file its consumer rather than pulling the
// declaration into the build, so the directive is the correct form here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./virtual.d.ts" />
/**
 * Public entry for the `brixter/controllers` export.
 *
 * Re-exports the framework-agnostic runner plus {@link initBrixControllers},
 * the zero-config runner wired to the controllers the Vite plugin collects.
 *
 * ## Convention
 *
 * Controllers live in `$lib/brixter/controllers/*.{ts,js}`. Each file
 * progressively enhances the brik it belongs to; by convention the file name
 * mirrors the brik it enhances — `Hero.brix` ↔ `controllers/hero.ts` — though
 * nothing enforces that at runtime.
 *
 * Adding a file that exports an init function registers it: there is no manual
 * registry to edit. Removing the file unregisters it.
 *
 * ## Lifecycle (SvelteKit)
 *
 * Controllers touch the DOM, so they only run on the client. Wire them up in
 * your root `+layout.svelte`, tearing down the previous run before re-attaching
 * so repeated client navigations never accumulate duplicate listeners:
 *
 * ```svelte
 * <script lang="ts">
 *   import { afterNavigate } from '$app/navigation';
 *   import { tick } from 'svelte';
 *   import { initBrixControllers } from 'brixter/controllers';
 *
 *   let { children } = $props();
 *   let teardown: () => void = () => {};
 *
 *   afterNavigate(async () => {
 *     teardown();
 *     await tick(); // let the new page's markup render first
 *     teardown = initBrixControllers();
 *   });
 * </script>
 *
 * {@render children()}
 * ```
 */
import controllerModules from 'virtual:brixter-controllers';
import { runBrixControllers } from './runner.ts';

export { runBrixControllers, type BrixController } from './runner.ts';

/**
 * Collect every controller under `$lib/brixter/controllers` (via the plugin's
 * virtual module) and run it against `root`, returning a combined cleanup.
 *
 * SSR-safe: controllers touch the DOM, so on the server (no `document`) this is
 * a no-op that returns a no-op cleanup. Invoke it from `afterNavigate`/`onMount`.
 */
export function initBrixControllers(root: ParentNode = globalThis.document): () => void {
	if (typeof document === 'undefined') return () => {};
	return runBrixControllers(controllerModules, root);
}
