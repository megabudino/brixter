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
	class="inline-block max-w-full cursor-pointer bg-[#2563EB] py-[15px] px-[24px] text-center font-sans text-base font-bold text-white shadow-md transition-all duration-200 ease-in-out hover:bg-[#3B82F6] focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-white focus:outline-none active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#3B82F6] dark:text-gray-100 dark:shadow-xl dark:hover:bg-[#2563EB] dark:focus:ring-[#3B82F6] dark:focus:ring-offset-[#030712] {className}"
>
	{@render children()}
</button>
