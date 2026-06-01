<script lang="ts">
	import { onMount } from 'svelte';
	import { Image, Trash2 } from 'lucide-svelte';

	let {
		element,
		onPick,
		onRemove,
		onBlur
	}: {
		element: HTMLImageElement;
		onPick: () => void;
		onRemove: () => void;
		onBlur: () => void;
	} = $props();

	let coords = $state({ top: 0, left: 0, width: 0, height: 0 });
	let isElementHovered = $state(false);
	let isToolbarHovered = $state(false);
	let isHovered = $derived(isElementHovered || isToolbarHovered);

	let currentSrc = $state(element?.src || '');
	let hasImage = $derived(
		currentSrc &&
		!currentSrc.startsWith('data:image/svg+xml') &&
		currentSrc !== 'about:blank' &&
		currentSrc !== ''
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

	onMount(() => {
		updateCoords();

		const win = element.ownerDocument.defaultView || window;
		win.addEventListener('scroll', updateCoords, { passive: true });
		win.addEventListener('resize', updateCoords, { passive: true });

		// Track hover state of the image element
		const handleMouseEnter = () => {
			isElementHovered = true;
		};
		const handleMouseLeave = () => {
			isElementHovered = false;
		};

		element.addEventListener('mouseenter', handleMouseEnter);
		element.addEventListener('mouseleave', handleMouseLeave);

		// Initialize hover state in case mouse is already over the image
		isElementHovered = element.matches(':hover');

		// Click outside to blur/close
		const handleGlobalClick = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target) return;

			if (!target.closest('.builder-preview-image-toolbar') && target !== element) {
				onBlur();
			}
		};

		win.document.addEventListener('click', handleGlobalClick, true);

		// Observe src attribute mutations to reactively update currentSrc
		const observer = new MutationObserver(() => {
			currentSrc = element.src || '';
			updateCoords();
		});
		observer.observe(element, { attributes: true, attributeFilter: ['src'] });

		return () => {
			win.removeEventListener('scroll', updateCoords);
			win.removeEventListener('resize', updateCoords);
			element.removeEventListener('mouseenter', handleMouseEnter);
			element.removeEventListener('mouseleave', handleMouseLeave);
			win.document.removeEventListener('click', handleGlobalClick, true);
			observer.disconnect();
		};
	});
</script>

<div
	class="builder-preview-image-toolbar"
	class:visible={isHovered}
	onmouseenter={() => {
		isToolbarHovered = true;
	}}
	onmouseleave={() => {
		isToolbarHovered = false;
	}}
	style="
		position: fixed;
		top: {coords.top + 8}px;
		left: {coords.left + coords.width - 8}px;
		transform: translate(-100%, 0);
		z-index: 99999;
	"
>
	<button
		type="button"
		use:clickListener={onPick}
		title="Choose image"
		class="toolbar-btn"
	>
		<Image size={14} />
		<span class="toolbar-label">Choose</span>
	</button>
	{#if hasImage}
		<button
			type="button"
			use:clickListener={onRemove}
			title="Remove image"
			class="toolbar-btn toolbar-btn-danger"
		>
			<Trash2 size={14} />
			<span class="toolbar-label">Remove</span>
		</button>
	{/if}
</div>

<style>
	.builder-preview-image-toolbar {
		display: flex;
		align-items: center;
		height: 2rem;
		overflow: hidden;
		border: 1px solid #d1d5db;
		background-color: #fff;
		font-size: 0.75rem;
		line-height: 1rem;
		color: #111827;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease-in-out;
	}

	.builder-preview-image-toolbar.visible {
		opacity: 1;
		pointer-events: auto;
	}

	:global(.dark) .builder-preview-image-toolbar {
		border-color: #4b5563;
		background-color: #1f2937;
		color: #f3f4f6;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: 100%;
		border: none;
		border-right: 1px solid #e5e7eb;
		background: transparent;
		padding: 0 0.625rem;
		color: inherit;
		font-size: inherit;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.toolbar-btn:last-child {
		border-right: none;
	}

	.toolbar-btn:hover {
		background-color: #f3f4f6;
	}

	:global(.dark) .toolbar-btn {
		border-right-color: #374151;
	}

	:global(.dark) .toolbar-btn:hover {
		background-color: #374151;
	}

	.toolbar-btn-danger {
		color: #dc2626;
	}

	.toolbar-btn-danger:hover {
		background-color: #fef2f2;
	}

	:global(.dark) .toolbar-btn-danger {
		color: #f87171;
	}

	:global(.dark) .toolbar-btn-danger:hover {
		background-color: rgba(153, 27, 27, 0.35);
	}

	.toolbar-label {
		font-weight: 500;
	}
</style>
