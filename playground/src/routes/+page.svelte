<script lang="ts">
	import { BrixEditor, createBrixDefinitions } from '@brixter/brix-builder';

	const definitions = createBrixDefinitions(
		import.meta.glob('../lib/brixter/brix/*.svelte', { eager: true }),
		import.meta.glob('../lib/brixter/brix/*.svelte', {
			query: '?raw',
			import: 'default',
			eager: true
		}) as Record<string, string>
	);
</script>

<BrixEditor {definitions} />