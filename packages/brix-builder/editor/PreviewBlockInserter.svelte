<script lang="ts">
	let {
		placement = 'after',
		edgeInset = false,
		onToggle
	}: {
		placement?: 'before' | 'after';
		edgeInset?: boolean;
		onToggle: () => void;
	} = $props();
</script>

<div
	class={placement === 'before'
		? edgeInset
			? 'pointer-events-none absolute top-2 right-0 left-0 z-40 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
			: 'pointer-events-none absolute top-0 right-0 left-0 z-40 -translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
		: edgeInset
			? 'pointer-events-none absolute right-0 bottom-2 left-0 z-40 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
			: 'pointer-events-none absolute right-0 bottom-0 left-0 z-40 translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'}
>
<div class="pointer-events-auto relative mx-auto flex w-max justify-center">
		<button
			type="button"
			class="relative flex h-8 w-8 cursor-pointer items-center justify-center border border-[#2563EB] bg-white text-lg leading-none text-[#2563EB] shadow-sm transition-colors hover:bg-[#2563EB] hover:text-white dark:border-[#3B82F6] dark:bg-[#0f1623] dark:text-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white"
			aria-label="Aggiungi componente"
			onclick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			+
		</button>
	</div>
</div>
