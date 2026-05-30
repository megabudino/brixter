<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let { label, id, name, class: className, ...rest }: HTMLInputAttributes & { label?: string } = $props();

	const inputId = id ?? name;
</script>

<div>
{#if label}
	<label for={inputId} class="block text-sm font-medium text-label mb-1">{label}</label>
{/if}
<input
	id={inputId}
	{name}
	class="block w-full border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] dark:border-gray-700 dark:bg-[#1f2937] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6] {className}"
	{...rest}
/>
</div>
