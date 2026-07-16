/**
 * The brix controller runner.
 *
 * `.brix` files are pure markup — they carry no `<script>`. Interactivity that
 * would live in a Svelte component's `<script>` instead lives in vanilla
 * JS/TS *controllers*: small modules that progressively enhance the rendered
 * DOM by hooking onto elements matched by `data-*` attributes.
 *
 * A controller is an init function that attaches behaviour to **every** element
 * matching its selector and returns a single teardown:
 *
 * ```ts
 * import type { BrixController } from 'brixter/controllers';
 *
 * export const initTilt: BrixController = (root = document) => {
 *   const cleanups: Array<() => void> = [];
 *   root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
 *     const onMove = (event: PointerEvent) => {
 *       // …reposition based on event…
 *     };
 *     el.addEventListener('pointermove', onMove);
 *     cleanups.push(() => el.removeEventListener('pointermove', onMove));
 *   });
 *   return () => cleanups.forEach((fn) => fn());
 * };
 * ```
 *
 * This module holds the framework-agnostic part: given the collected controller
 * modules, run each init in isolation and hand back a combined cleanup. It
 * touches no Svelte and performs no module collection, so it can be unit-tested
 * with a fake `root`.
 */

/**
 * A brix controller: an init function that enhances all elements matched by its
 * selector under `root` and returns a cleanup that detaches everything it added.
 */
export type BrixController = (root: ParentNode) => () => void;

const noop = () => {};

function isController(value: unknown): value is BrixController {
	return typeof value === 'function';
}

/**
 * Run every controller exported by the collected modules against `root`.
 *
 * Modules are the value of an eager `import.meta.glob` — a map of module path to
 * module namespace object. Every exported function (the default export and any
 * named `init*` export) is treated as a controller init.
 *
 * Guarantees:
 * - **Deterministic order.** `import.meta.glob` does not guarantee ordering, so
 *   modules are sorted by path (and exports by name) before running.
 * - **Error isolation.** Each init runs in its own `try`/`catch`; a throwing
 *   controller is logged with a `[brix]` prefix and contributes a no-op cleanup,
 *   so the other controllers still run.
 * - **Combined cleanup.** The returned function tears down every controller that
 *   attached, each guarded so one failing teardown does not skip the rest.
 */
export function runBrixControllers(
	modules: Record<string, unknown>,
	root: ParentNode = document
): () => void {
	const cleanups: Array<() => void> = [];

	for (const path of Object.keys(modules).sort()) {
		const mod = modules[path];
		if (!mod || typeof mod !== 'object') continue;

		const record = mod as Record<string, unknown>;
		const seen = new Set<BrixController>();

		for (const name of Object.keys(record).sort()) {
			const exported = record[name];
			if (!isController(exported) || seen.has(exported)) continue;
			seen.add(exported);

			try {
				const cleanup = exported(root);
				cleanups.push(typeof cleanup === 'function' ? cleanup : noop);
			} catch (error) {
				console.error(`[brix] controller "${name}" in ${path} failed to initialise`, error);
				cleanups.push(noop);
			}
		}
	}

	return () => {
		// Splice so a second call to the combined cleanup is a safe no-op.
		for (const cleanup of cleanups.splice(0)) {
			try {
				cleanup();
			} catch (error) {
				console.error('[brix] controller cleanup failed', error);
			}
		}
	};
}
