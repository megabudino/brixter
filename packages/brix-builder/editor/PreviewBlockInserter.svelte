<script lang="ts">
	import type { BuilderRenderDefinition } from './contracts.js';

	let {
		definitions,
		open,
		onToggle,
		onClose,
		onInsert
	}: {
		definitions: BuilderRenderDefinition[];
		open: boolean;
		onToggle: () => void;
		onClose: () => void;
		onInsert: (type: string) => void;
	} = $props();

	function handleWindowClick(): void {
		if (open) {
			onClose();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (open && event.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2 translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
	<div class="pointer-events-auto relative">
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center bg-[#2563EB] text-lg leading-none text-white shadow-sm transition-colors hover:bg-[#3B82F6]"
			aria-label="Aggiungi componente"
			aria-expanded={open}
			onclick={(event) => {
				event.stopPropagation();
				onToggle();
			}}>
			+
		</button>

		{#if open}
			<div
				class="absolute left-1/2 top-10 z-40 w-72 -translate-x-1/2 border border-gray-200 bg-white py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:border-gray-700 dark:bg-[#1f2937]"
				role="menu"
				aria-label="Seleziona componente"
				tabindex="-1"
				onclick={(event) => {
					event.stopPropagation();
					onClose();
				}}
				onkeydown={(event) => {
					if (event.key === 'Escape') {
						event.stopPropagation();
						onClose();
					}
				}}>
				<div class="border-b border-gray-200 px-3 pb-2 dark:border-gray-700">
					<p class="text-muted text-xs font-semibold uppercase tracking-wide">Aggiungi componente</p>
				</div>

				<div class="max-h-80 overflow-y-auto py-1">
					{#each definitions as definition (definition.type)}
						<button
							type="button"
							class="block w-full px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
							role="menuitem"
							onclick={(event) => {
								event.stopPropagation();
								onInsert(definition.type);
							}}>
							<span class="block text-sm font-medium text-gray-900 dark:text-gray-100">{definition.type}</span>
							<span class="text-muted mt-0.5 line-clamp-2 block text-xs leading-5">
								{definition.description}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
