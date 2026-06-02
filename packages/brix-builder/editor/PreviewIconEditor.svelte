<script lang="ts">
	import { onMount } from 'svelte';
	import { HelpCircle, Trash2 } from 'lucide-svelte';

	let {
		element,
		onPick,
		onRemove,
		onFocus,
		onBlur
	}: {
		element: HTMLElement;
		onPick: () => void;
		onRemove: () => void;
		onFocus: () => void;
		onBlur: () => void;
	} = $props();

	let coords = $state({ top: 0, left: 0, width: 0, height: 0 });
	let isOpen = $state(false);

	let hasIcon = $derived(
		element &&
		!element.hasAttribute('data-builder-icon-empty') &&
		element.innerHTML.trim() !== ''
	);

	function updateCoords() {
		const rect = element.getBoundingClientRect();
		coords = {
			top: rect.top,
			left: rect.left,
			width: rect.width,
			height: rect.height
		};
	}

	function clickListener(node: HTMLButtonElement, action: () => void) {
		const handler = (event: MouseEvent) => {
			event.stopPropagation();
			action();
		};
		node.addEventListener('click', handler);
		return {
			destroy() {
				node.removeEventListener('click', handler);
			}
		};
	}

	export function close() {
		isOpen = false;
	}

	onMount(() => {
		updateCoords();

		const win = element.ownerDocument.defaultView || window;
		win.addEventListener('scroll', updateCoords, { passive: true });
		win.addEventListener('resize', updateCoords, { passive: true });

		// Click to activate and open menu
		const handleElementClick = (event: MouseEvent) => {
			event.stopPropagation();
			isOpen = true;
			onFocus();
			updateCoords();
		};
		element.addEventListener('click', handleElementClick);

		// Click outside to blur/close
		const handleGlobalClick = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target) return;

			if (
				!target.closest('.builder-preview-icon-menu') &&
				target !== element &&
				!element.contains(target)
			) {
				isOpen = false;
				onBlur();
			}
		};

		win.document.addEventListener('click', handleGlobalClick, true);

		// Observe changes in element structure to update coordinates
		const observer = new MutationObserver(() => {
			updateCoords();
		});
		observer.observe(element, { attributes: true, childList: true, subtree: true });

		return () => {
			win.removeEventListener('scroll', updateCoords);
			win.removeEventListener('resize', updateCoords);
			element.removeEventListener('click', handleElementClick);
			win.document.removeEventListener('click', handleGlobalClick, true);
			observer.disconnect();
		};
	});
</script>

{#if isOpen}
	<div
		class="builder-preview-icon-menu"
		style="
			position: fixed;
			top: {coords.top + coords.height + 6}px;
			left: {coords.left + coords.width / 2}px;
			transform: translate(-50%, 0);
			z-index: 99999;
		"
	>
		<button
			type="button"
			use:clickListener={onPick}
			class="menu-item"
		>
			<HelpCircle size={14} />
			<span>Choose Icon...</span>
		</button>
		{#if hasIcon}
			<button
				type="button"
				use:clickListener={onRemove}
				class="menu-item menu-item-danger"
			>
				<Trash2 size={14} />
				<span>Remove Icon</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.builder-preview-icon-menu {
		display: flex;
		flex-direction: column;
		border: 1px solid rgba(0, 0, 0, 0.08);
		background-color: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-radius: 8px;
		padding: 4px;
		font-size: 0.75rem;
		color: #1f2937;
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
		min-width: 140px;
		animation: popover-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes popover-in {
		from {
			opacity: 0;
			transform: translate(-50%, -4px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
	}

	:global(.dark) .builder-preview-icon-menu {
		border-color: rgba(255, 255, 255, 0.08);
		background-color: rgba(31, 41, 55, 0.95);
		color: #f3f4f6;
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		border: none;
		background: transparent;
		padding: 6px 12px;
		color: inherit;
		font-size: inherit;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		border-radius: 6px;
		transition: background-color 0.15s, color 0.15s;
	}

	.menu-item:hover {
		background-color: #f3f4f6;
	}

	:global(.dark) .menu-item:hover {
		background-color: #374151;
	}

	.menu-item-danger {
		color: #dc2626;
	}

	.menu-item-danger:hover {
		background-color: #fef2f2;
		color: #b91c1c;
	}

	:global(.dark) .menu-item-danger {
		color: #f87171;
	}

	:global(.dark) .menu-item-danger:hover {
		background-color: rgba(239, 68, 68, 0.15);
		color: #fca5a5;
	}
</style>
