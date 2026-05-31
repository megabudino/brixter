<script lang="ts">
	import ComponentPreviewThumbnail from './ComponentPreviewThumbnail.svelte';
	import type { BuilderRenderDefinition } from './contracts.js';

	let {
		definitions,
		open,
		placement = 'after',
		lineVisible = true,
		edgeInset = false,
		onToggle,
		onClose,
		onInsert
	}: {
		definitions: BuilderRenderDefinition[];
		open: boolean;
		placement?: 'before' | 'after';
		lineVisible?: boolean;
		edgeInset?: boolean;
		onToggle: () => void;
		onClose: () => void;
		onInsert: (type: string) => void;
	} = $props();

	let root = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const ownerWindow = root?.ownerDocument.defaultView;
		if (!ownerWindow) {
			return;
		}

		ownerWindow.addEventListener('click', handleWindowClick);
		ownerWindow.addEventListener('keydown', handleWindowKeydown);

		return () => {
			ownerWindow.removeEventListener('click', handleWindowClick);
			ownerWindow.removeEventListener('keydown', handleWindowKeydown);
		};
	});

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

<div
	bind:this={root}
	class={placement === 'before'
		? edgeInset
			? 'pointer-events-none absolute top-0 right-0 left-0 z-40 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
			: 'pointer-events-none absolute top-0 right-0 left-0 z-40 -translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
		: edgeInset
			? 'pointer-events-none absolute right-0 bottom-0 left-0 z-40 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'
			: 'pointer-events-none absolute right-0 bottom-0 left-0 z-40 translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100'}
>
	{#if lineVisible}
		<div
			class="absolute top-1/2 left-1/2 w-[min(70%,32rem)] -translate-x-1/2 border-t border-dashed border-[#2563EB] dark:border-[#3B82F6]"
		></div>
	{/if}
	<div class="pointer-events-auto relative mx-auto flex w-max justify-center">
		<button
			type="button"
			class="relative flex h-8 w-8 items-center justify-center border border-[#2563EB] bg-white text-lg leading-none text-[#2563EB] shadow-sm transition-colors hover:bg-[#2563EB] hover:text-white dark:border-[#3B82F6] dark:bg-[#0f1623] dark:text-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white"
			aria-label="Aggiungi componente"
			aria-expanded={open}
			onclick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			+
		</button>
	</div>
</div>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-6">
		<button
			type="button"
			class="absolute inset-0 bg-black/45"
			aria-label="Chiudi selezione componente"
			onclick={(event) => {
				event.stopPropagation();
				onClose();
			}}
		></button>
		<div
			class="relative flex max-h-[min(760px,calc(100vh-3rem))] w-full max-w-5xl flex-col border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-[#111827]"
			role="dialog"
			aria-modal="true"
			aria-label="Scegli componente da aggiungere"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					event.stopPropagation();
					onClose();
				}
			}}
		>
			<div
				class="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-700"
			>
				<div>
					<h2 class="text-heading text-lg font-semibold">Aggiungi componente</h2>
					<p class="text-muted mt-1 text-sm">
						Scegli il brik da inserire {placement === 'before' ? 'prima' : 'dopo'} questa sezione.
					</p>
				</div>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center border border-gray-300 text-xl leading-none text-gray-700 transition-colors hover:border-[#2563EB] hover:bg-[#2563EB] hover:text-white dark:border-gray-600 dark:text-gray-200 dark:hover:border-[#3B82F6] dark:hover:bg-[#3B82F6]"
					aria-label="Chiudi"
					onclick={onClose}
				>
					×
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-5">
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each definitions as definition (definition.type)}
						<button
							type="button"
							class="group overflow-hidden border border-gray-200 bg-white text-left transition-colors hover:border-[#2563EB] hover:bg-blue-50/50 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30 focus:outline-none dark:border-gray-700 dark:bg-[#1f2937] dark:hover:border-[#3B82F6] dark:hover:bg-[#1e293b] dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]/30"
							onclick={(event) => {
								event.stopPropagation();
								onInsert(definition.type);
							}}
						>
							<ComponentPreviewThumbnail {definition} />
							<div class="border-t border-gray-200 p-4 dark:border-gray-700">
								<p class="text-heading text-sm font-semibold">{definition.type}</p>
								<p class="text-muted mt-1 line-clamp-2 text-xs leading-5">
									{definition.description}
								</p>
							</div>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}
