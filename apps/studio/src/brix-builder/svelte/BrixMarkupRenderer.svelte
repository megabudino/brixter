<script lang="ts">
	import { render } from '../markup/render.js';
	import type { TemplateNode } from '../markup/parser.js';

	let {
		template,
		props
	}: { template: TemplateNode[]; props: Record<string, unknown> } = $props();

	// Re-renders whenever props change, so editor edits update the preview live.
	// The output keeps every `data-brixter-*` attribute, so the DOM-driven
	// interaction layer (overlays, inline editing, collection selection) works
	// exactly as it does for compiled brix.
	const html = $derived(render(template, props ?? {}));
</script>

{@html html}
