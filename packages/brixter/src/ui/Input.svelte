<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let { label, id, name, class: className, ...rest }: HTMLInputAttributes & { label?: string } = $props();

	const inputId = id ?? name;
</script>

<div>
{#if label}
	<label for={inputId} class="block text-sm font-medium bx-text-label mb-1">{label}</label>
{/if}
<input
	id={inputId}
	{name}
	class="block w-full border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:bx-border-accent focus:outline-none focus:ring-1 focus:bx-ring-accent-focus dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 {className}"
	{...rest}
/>
</div>
