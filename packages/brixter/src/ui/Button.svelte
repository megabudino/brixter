<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
	}

	let { children, class: className, disabled = false, type }: Props = $props();
</script>

<button
	{type}
	{disabled}
	class="btn-brutal inline-block max-w-full py-[15px] px-[24px] text-center font-sans text-base font-bold {className}"
>
	{@render children()}
</button>
