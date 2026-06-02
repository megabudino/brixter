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
		onAddBlockBefore,
		onAddBlockAfter,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onOpenReorderModal,
		onOpenInserterModal,
		onDeselectBlock,
		onKeydown,
		previewMode = false,
		viewportSize = 'desktop'
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
		rendererProps.onAddBlockBefore = onAddBlockBefore;
		rendererProps.onAddBlockAfter = onAddBlockAfter;
		rendererProps.onAddItem = onAddItem;
		rendererProps.onRemoveItem = onRemoveItem;
		rendererProps.onMoveItem = onMoveItem;
		rendererProps.onOpenReorderModal = onOpenReorderModal;
		rendererProps.onOpenInserterModal = onOpenInserterModal;
		rendererProps.onDeselectBlock = onDeselectBlock;
		rendererProps.previewMode = previewMode;
		rendererProps.viewportSize = viewportSize;
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
	overflow-x: hidden;
	overflow-y: auto;
}

body.dark {
	background: #0f1623;
	color: #f3f4f6;
}

#builder-preview-root {
	width: 100%;
}

* {
	scrollbar-color: #cbd5e1 transparent;
	scrollbar-width: thin;
}

*::-webkit-scrollbar {
	width: 10px;
	height: 10px;
}

*::-webkit-scrollbar-track {
	background: transparent;
}

*::-webkit-scrollbar-thumb {
	min-height: 40px;
	border: 3px solid transparent;
	border-radius: 999px;
	background: #cbd5e1;
	background-clip: padding-box;
}

*::-webkit-scrollbar-thumb:hover {
	background: #2563eb;
	background-clip: padding-box;
}

*::-webkit-scrollbar-corner {
	background: transparent;
}

.dark * {
	scrollbar-color: #475569 transparent;
}

.dark *::-webkit-scrollbar-thumb {
	background: #475569;
	background-clip: padding-box;
}

.dark *::-webkit-scrollbar-thumb:hover {
	background: #3b82f6;
	background-clip: padding-box;
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

.builder-preview-text-editor {
	position: relative;
	white-space: inherit;
}

.builder-preview-text-editor.is-editor-empty::before {
	content: attr(data-placeholder);
	color: #9ca3af;
	opacity: 0.6;
	pointer-events: none;
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	text-align: inherit;
}

.builder-preview-text-editor--inline.is-editor-empty::before {
	position: static;
	display: inline;
	white-space: nowrap;
}

[data-builder-field-enhanced='true']:is(a, button, [role='button'], [role='link'])
	.builder-preview-text-editor--inline.is-editor-empty::before {
	white-space: nowrap;
}

.ProseMirror.is-editor-empty::before {
	content: attr(data-placeholder);
	color: #9ca3af;
	opacity: 0.6;
	pointer-events: none;
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	text-align: inherit;
}

[data-builder-field-enhanced='true']:is(a, button, [role='button'], [role='link']) {
	display: inline-flex !important;
	align-items: center;
	justify-content: center;
	color: var(--builder-preview-field-text-color) !important;
	-webkit-text-fill-color: var(--builder-preview-field-text-color);
}

.builder-richtext-inline-editor--host-inline.is-editor-empty::before {
	position: absolute;
	left: 0;
	right: 0;
	top: 50%;
	transform: translateY(-50%);
	display: block;
	white-space: nowrap;
	text-align: inherit;
}

.builder-richtext-inline-editor--host-inline.ProseMirror-focused.is-editor-empty::before {
	content: none;
}

.builder-preview-text-editor::placeholder {
	color: #9ca3af;
	opacity: 0.6;
}

.ProseMirror {
	position: relative;
	white-space: inherit;
}

[data-builder-field]:empty::before,
[data-builder-field] > p:only-child:empty::before,
[data-builder-field] > p:only-child:has(> br:only-child)::before {
	content: attr(data-builder-placeholder);
	color: #9ca3af;
	opacity: 1;
	pointer-events: none;
}

[data-builder-field]:is(a, button, [role='button'], [role='link']):empty::before {
	display: inline;
}

[data-builder-field] > p:only-child:has(> br:only-child) > br {
	display: none;
}

[data-builder-placeholder-active]:not(img):not([data-builder-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
) {
	opacity: 0.6;
}

[data-builder-placeholder-active]:not(img):not([data-builder-field-enhanced='true']):is(
	a,
	button,
	[role='button'],
	[role='link']
) {
	opacity: 1;
	color: #9ca3af !important;
}

[data-builder-placeholder-active]:not(img):not([data-builder-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
),
[data-builder-placeholder-active]:not(img):not([data-builder-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
) *:not(.builder-preview-field-editor):not(.builder-preview-text-editor):not(.ProseMirror):not(.builder-richtext-inline-editor):not(.builder-richtext-mount) {
	color: #9ca3af !important;
}

[data-builder-field-enhanced='true'] .builder-preview-text-editor,
[data-builder-field-enhanced='true'] .ProseMirror,
[data-builder-field-enhanced='true'] .builder-richtext-inline-editor,
[data-builder-field-enhanced='true'] .builder-richtext-inline-editor p {
	color: var(--builder-preview-field-text-color, currentColor) !important;
	-webkit-text-fill-color: var(--builder-preview-field-text-color, currentColor);
	caret-color: var(--builder-preview-field-text-color, currentColor);
}

body[data-builder-preview-page-overflow='true']::before {
	position: fixed;
	top: 12px;
	right: 12px;
	z-index: 2147483647;
	border: 1px solid #f59e0b;
	background: #fffbeb;
	color: #92400e;
	content: 'Page overflow';
	font: 600 12px/1.2 system-ui, sans-serif;
	padding: 6px 8px;
	pointer-events: none;
}

[data-builder-preview-overflow-item='true'] {
	outline: 2px solid #f59e0b !important;
	outline-offset: -2px;
}

body[data-builder-preview-canvas] [data-builder-preview-content] :is(
	a,
	button,
	input[type='submit'],
	input[type='button'],
	input[type='reset'],
	input[type='checkbox'],
	input[type='radio'],
	label[for],
	select,
	textarea,
	summary,
	[role='button'],
	[role='link']
),
body[data-builder-preview-canvas] [data-builder-preview-content] :is(
	a,
	button,
	input[type='submit'],
	input[type='button'],
	input[type='reset'],
	input[type='checkbox'],
	input[type='radio'],
	label[for],
	select,
	textarea,
	summary,
	[role='button'],
	[role='link']
) * {
	pointer-events: none !important;
}

body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='pending'],
body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='true'] .builder-preview-field-editor,
body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='true'] .builder-preview-text-editor,
body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='true'] .ProseMirror,
body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='true'] .builder-richtext-inline-editor,
body[data-builder-preview-canvas] [data-builder-preview-content] [data-builder-field-enhanced='true'] .builder-richtext-mount {
	pointer-events: auto !important;
}

[data-builder-field][data-builder-kind='icon']:empty::before {
	content: '+';
	font-family: inherit;
	font-weight: bold;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.25rem;
	height: 1.25rem;
	border: 1px dashed currentColor;
	border-radius: 4px;
	opacity: 0.6;
}

body[data-builder-preview-canvas] [data-builder-field][data-builder-kind='icon']:hover,
body[data-builder-preview-canvas] [data-builder-field][data-builder-kind='icon'][data-builder-field-enhanced='true'] {
	outline: 2px dashed #2563eb !important;
	outline-offset: 2px;
	border-radius: 4px;
}
.dark body[data-builder-preview-canvas] [data-builder-field][data-builder-kind='icon']:hover,
.dark body[data-builder-preview-canvas] [data-builder-field][data-builder-kind='icon'][data-builder-field-enhanced='true'] {
	outline-color: #3b82f6 !important;
}
`;
		frameDocument.head.append(styleElement);

		let cleanupHeadSync: (() => void) | null = syncHeadAssets(frameDocument);
		const removeKeydownListener = syncFrameKeydown(frameDocument);
		const removeThemeSync = syncThemeClass(frameDocument);
		const removeOverflowDiagnostic = syncPreviewOverflow(frameDocument);

		return () => {
			cleanupHeadSync?.();
			cleanupHeadSync = null;
			removeKeydownListener();
			removeThemeSync();
			removeOverflowDiagnostic();
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

	function syncPreviewOverflow(frameDocument: Document): () => void {
		let syncQueued = false;
		let animationFrame = 0;
		const frameWindow = frameDocument.defaultView ?? window;
		const FrameResizeObserver = frameWindow.ResizeObserver ?? ResizeObserver;

		function queueSync(): void {
			if (syncQueued) {
				return;
			}

			syncQueued = true;
			animationFrame = frameWindow.requestAnimationFrame(sync);
		}

		function sync(): void {
			syncQueued = false;
			clearOverflowMarkers(frameDocument);

			const viewportWidth = frameDocument.documentElement.clientWidth;
			const offenders = findPreviewOverflowElements(frameDocument, viewportWidth);
			frameDocument.body.toggleAttribute(
				'data-builder-preview-page-overflow',
				offenders.length > 0
			);

			for (const offender of offenders.slice(0, 20)) {
				offender.setAttribute('data-builder-preview-overflow-item', 'true');
			}
		}

		const mutationObserver = new MutationObserver((records) => {
			if (records.every(isOverflowDiagnosticMutation)) {
				return;
			}

			queueSync();
		});
		mutationObserver.observe(frameDocument.body, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true
		});

		const resizeObserver = new FrameResizeObserver(queueSync);
		resizeObserver.observe(frameDocument.documentElement);
		queueSync();

		return () => {
			if (animationFrame) {
				frameWindow.cancelAnimationFrame(animationFrame);
			}
			mutationObserver.disconnect();
			resizeObserver.disconnect();
			clearOverflowMarkers(frameDocument);
			frameDocument.body.removeAttribute('data-builder-preview-page-overflow');
		};
	}

	function isOverflowDiagnosticMutation(record: MutationRecord): boolean {
		return (
			record.type === 'attributes' &&
			(record.attributeName === 'data-builder-preview-overflow-item' ||
				record.attributeName === 'data-builder-preview-page-overflow')
		);
	}

	function findPreviewOverflowElements(
		frameDocument: Document,
		viewportWidth: number
	): HTMLElement[] {
		const offenders = new Set<HTMLElement>();
		const contentRoots = Array.from(
			frameDocument.querySelectorAll<HTMLElement>('[data-builder-preview-content]')
		);

		for (const contentRoot of contentRoots) {
			if (contentRoot.scrollWidth > contentRoot.clientWidth + 1) {
				offenders.add(contentRoot);
			}

			for (const element of Array.from(contentRoot.querySelectorAll<HTMLElement>('*'))) {
				if (element.getClientRects().length === 0) {
					continue;
				}

				const rect = element.getBoundingClientRect();
				if (rect.left < -1 || rect.right > viewportWidth + 1) {
					offenders.add(element);
				}
			}
		}

		return Array.from(offenders);
	}

	function clearOverflowMarkers(frameDocument: Document): void {
		for (const element of Array.from(
			frameDocument.querySelectorAll('[data-builder-preview-overflow-item]')
		)) {
			element.removeAttribute('data-builder-preview-overflow-item');
		}
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('"', '&quot;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
	}
</script>

<div
	class="relative flex h-full w-full items-center justify-center p-0 transition-colors duration-300"
	class:bg-gray-100={viewportSize !== 'desktop'}
	class:dark:bg-gray-950={viewportSize !== 'desktop'}
	class:p-4={viewportSize !== 'desktop'}
>
	<iframe
		use:previewFrame
		title="Preview"
		class="block h-full border-0 bg-white dark:bg-[#0f1623] transition-all duration-300 ease-in-out"
		class:w-full={viewportSize === 'desktop'}
		class:shadow-2xl={viewportSize !== 'desktop'}
		class:border={viewportSize !== 'desktop'}
		class:border-gray-200={viewportSize !== 'desktop'}
		class:dark:border-gray-800={viewportSize !== 'desktop'}
		class:rounded-md={viewportSize !== 'desktop'}
		style={viewportSize === 'tablet' ? 'width: 768px;' : viewportSize === 'mobile' ? 'width: 375px;' : ''}
	></iframe>
</div>
