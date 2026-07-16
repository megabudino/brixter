/**
 * The `brixter` Vite plugin serves this virtual module. It resolves to the
 * eager `import.meta.glob` of the consumer's `controllers/` directory, so the
 * runtime can collect every controller without a hand-maintained registry.
 */
declare module 'virtual:brixter-controllers' {
	const modules: Record<string, unknown>;
	export default modules;
}
