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
			class="btn-brutal-icon relative flex h-8 w-8 items-center justify-center text-lg leading-none"
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
