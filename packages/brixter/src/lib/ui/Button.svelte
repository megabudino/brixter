<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
		disabled?: boolean;
	}

	let { children, class: className, disabled = false }: Props = $props();
</script>

<button
	{disabled}
	class="btn-brutal inline-block max-w-full py-[15px] px-[24px] text-center font-sans text-base font-bold {className}"
>
	{@render children()}
</button>
