<script lang="ts">
	import { mount, unmount } from 'svelte';
	import type { BrikDefinition } from '../svelte/adapter.js';
	import SveltePreviewRenderer from '../svelte/SveltePreviewRenderer.svelte';
	import type { BuilderAppPreviewProps } from './contracts.js';

	let {
		definitions,
		blocks,
		propsErrors,
		previewOverlays,
		previewCollectionOverlays,
		activeBlockId,
		activeFieldEdit,
		previewContainer,
		onPreviewClick,
		onPreviewKeydown,
		onSelectBlock,
		onCloseFieldEdit,
		onUpdateRichText,
		onUpdateText,
		onQueueFileEdit,
		onAddBlockAfter,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onOpenReorderModal,
		onKeydown
	}: BuilderAppPreviewProps & {
		definitions: BrikDefinition[];
		onKeydown?: (event: KeyboardEvent) => void;
	} = $props();

	const rendererProps = $state({} as BuilderAppPreviewProps & { definitions: BrikDefinition[] });

	$effect(() => {
		syncRendererProps();
	});

	function syncRendererProps(): void {
		rendererProps.definitions = definitions;
		rendererProps.blocks = blocks;
		rendererProps.propsErrors = propsErrors;
		rendererProps.previewOverlays = previewOverlays;
		rendererProps.previewCollectionOverlays = previewCollectionOverlays;
		rendererProps.activeBlockId = activeBlockId;
		rendererProps.activeFieldEdit = activeFieldEdit;
		rendererProps.previewContainer = previewContainer;
		rendererProps.onPreviewClick = onPreviewClick;
		rendererProps.onPreviewKeydown = onPreviewKeydown;
		rendererProps.onSelectBlock = onSelectBlock;
		rendererProps.onCloseFieldEdit = onCloseFieldEdit;
		rendererProps.onUpdateRichText = onUpdateRichText;
		rendererProps.onUpdateText = onUpdateText;
		rendererProps.onQueueFileEdit = onQueueFileEdit;
		rendererProps.onAddBlockAfter = onAddBlockAfter;
		rendererProps.onAddItem = onAddItem;
		rendererProps.onRemoveItem = onRemoveItem;
		rendererProps.onMoveItem = onMoveItem;
		rendererProps.onOpenReorderModal = onOpenReorderModal;
	}

	function previewFrame(node: HTMLIFrameElement): { destroy: () => void } {
		let renderer: Record<string, unknown> | null = null;
		let cleanupFrameDocument: (() => void) | null = null;
		let destroyed = false;

		void initialize();

		async function initialize(): Promise<void> {
			const frameDocument = node.contentDocument;
			if (!frameDocument) {
				return;
			}

			frameDocument.open();
			frameDocument.write(`<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<base href="${escapeHtml(document.baseURI)}">
	</head>
	<body>
		<div id="builder-preview-root"></div>
	</body>
</html>`);
			frameDocument.close();

			await Promise.resolve();
			if (destroyed) {
				return;
			}

			const target = frameDocument.getElementById('builder-preview-root');
			if (!target) {
				return;
			}

			syncRendererProps();
			cleanupFrameDocument = setupFrameDocument(frameDocument);
			renderer = mount(SveltePreviewRenderer, {
				target,
				props: rendererProps
			}) as Record<string, unknown>;
		}

		return {
			destroy() {
				destroyed = true;
				cleanupFrameDocument?.();
				cleanupFrameDocument = null;
				if (renderer) {
					void unmount(renderer);
					renderer = null;
				}
			}
		};
	}

	function setupFrameDocument(frameDocument: Document): () => void {
		const styleElement = frameDocument.createElement('style');
		styleElement.textContent = `
html,
body,
#builder-preview-root {
	min-height: 100%;
}

html,
body {
	margin: 0;
}

body {
	background: #ffffff;
	color: #111827;
	overflow: auto;
}

body.dark {
	background: #0f1623;
	color: #f3f4f6;
}

#builder-preview-root {
	width: 100%;
}

[data-builder-field-enhanced='pending'],
[data-builder-field-enhanced='true'],
.builder-preview-field-editor,
.builder-richtext-inline-editor,
.builder-preview-text-editor {
	cursor: text;
}

.builder-preview-field-editor,
.builder-richtext-mount {
	display: contents;
}

.ProseMirror {
	white-space: inherit;
}
`;
		frameDocument.head.append(styleElement);

		let cleanupHeadSync: (() => void) | null = syncHeadAssets(frameDocument);
		const removeKeydownListener = syncFrameKeydown(frameDocument);
		const removeThemeSync = syncThemeClass(frameDocument);

		return () => {
			cleanupHeadSync?.();
			cleanupHeadSync = null;
			removeKeydownListener();
			removeThemeSync();
		};
	}

	function syncHeadAssets(frameDocument: Document): () => void {
		let syncQueued = false;

		function sync(): void {
			syncQueued = false;
			for (const node of Array.from(
				frameDocument.head.querySelectorAll('[data-builder-preview-head-asset="true"]')
			)) {
				node.remove();
			}

			for (const asset of document.head.querySelectorAll(
				'link[rel="stylesheet"], link[rel="preconnect"], style'
			)) {
				const clone = asset.cloneNode(true) as HTMLElement;
				clone.dataset.builderPreviewHeadAsset = 'true';
				if (asset instanceof HTMLLinkElement && clone instanceof HTMLLinkElement && asset.href) {
					clone.href = asset.href;
				}
				frameDocument.head.append(clone);
			}
		}

		function queueSync(): void {
			if (syncQueued) {
				return;
			}
			syncQueued = true;
			requestAnimationFrame(sync);
		}

		const observer = new MutationObserver(queueSync);
		observer.observe(document.head, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true
		});
		sync();

		return () => {
			observer.disconnect();
		};
	}

	function syncFrameKeydown(frameDocument: Document): () => void {
		const handler = (event: KeyboardEvent) => {
			onKeydown?.(event);
		};
		frameDocument.addEventListener('keydown', handler);

		return () => {
			frameDocument.removeEventListener('keydown', handler);
		};
	}

	function syncThemeClass(frameDocument: Document): () => void {
		function applyThemeClass(): void {
			const isDark =
				document.documentElement.classList.contains('dark') ||
				document.body.classList.contains('dark');
			frameDocument.documentElement.classList.toggle('dark', isDark);
			frameDocument.body.classList.toggle('dark', isDark);
		}

		const observer = new MutationObserver(applyThemeClass);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		applyThemeClass();

		return () => {
			observer.disconnect();
		};
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('"', '&quot;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
	}
</script>

<iframe
	use:previewFrame
	title="Preview"
	class="block h-full min-h-full w-full border-0 bg-white dark:bg-[#0f1623]"
></iframe>
