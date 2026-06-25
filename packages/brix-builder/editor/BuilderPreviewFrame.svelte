<script lang="ts">
	import { mount, unmount } from 'svelte';
	import type { BrikDefinition } from '../svelte/adapter.js';
	import SveltePreviewRenderer from '../svelte/SveltePreviewRenderer.svelte';
	import type { BuilderAppPreviewProps } from './contracts.js';
	import { syncPreviewHeadAssets, syncPreviewTheme } from './preview-frame-support.js';

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
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onOpenReorderModal,
		onOpenInserter,
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
		rendererProps.onAddItem = onAddItem;
		rendererProps.onRemoveItem = onRemoveItem;
		rendererProps.onMoveItem = onMoveItem;
		rendererProps.onOpenReorderModal = onOpenReorderModal;
		rendererProps.onOpenInserter = onOpenInserter;
		rendererProps.onDeselectBlock = onDeselectBlock;
		rendererProps.previewMode = previewMode;
		rendererProps.viewportSize = viewportSize;
	}

	function previewFrame(node: HTMLIFrameElement): { update: () => void; destroy: () => void } {
		let renderer: Record<string, unknown> | null = null;
		let cleanupFrameDocument: (() => void) | null = null;
		let cleanupHeadAssets: (() => void) | null = null;
		let cleanupThemeSync: (() => void) | null = null;
		let destroyed = false;
		const sourceDocument = node.ownerDocument;

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
	<body class="brixter-preview-root">
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
			cleanupHeadAssets = syncPreviewHeadAssets(frameDocument, sourceDocument, true);
			cleanupThemeSync = syncPreviewTheme(frameDocument);
			renderer = mount(SveltePreviewRenderer, {
				target,
				props: rendererProps
			}) as Record<string, unknown>;
		}

		return {
			update() {
				const frameDocument = node.contentDocument;
				if (!frameDocument) {
					return;
				}

				syncRendererProps();
			},
			destroy() {
				destroyed = true;
				cleanupHeadAssets?.();
				cleanupHeadAssets = null;
				cleanupThemeSync?.();
				cleanupThemeSync = null;
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
	background: transparent;
	color: inherit;
	overflow-x: hidden;
	overflow-y: auto;
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
	background: #fde047;
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
	background: #facc15;
	background-clip: padding-box;
}

[data-brixter-field-enhanced='pending'],
[data-brixter-field-enhanced='true'],
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

[data-brixter-field-enhanced='true']:is(a, button, [role='button'], [role='link'])
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

[data-brixter-field-enhanced='true']:is(a, button, [role='button'], [role='link']) {
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

[data-brixter-field]:empty::before,
[data-brixter-field] > p:only-child:empty::before,
[data-brixter-field] > p:only-child:has(> br:only-child)::before,
[data-brixter-field][data-brixter-placeholder-active]:not([data-brixter-field-enhanced='true']):not(img)::before {
	content: attr(data-brixter-placeholder);
	color: #9ca3af;
	opacity: 1;
	pointer-events: none;
}

[data-brixter-field]:is(a, button, [role='button'], [role='link']):empty::before {
	display: inline;
}

[data-brixter-field] > p:only-child:has(> br:only-child) > br {
	display: none;
}

img[data-brixter-field][data-brixter-placeholder-active] {
	background-color: #f4f4f5;
	object-fit: cover;
}

body.dark img[data-brixter-field][data-brixter-placeholder-active] {
	background-color: #27272a;
}

[data-brixter-placeholder-active]:not(img):not([data-brixter-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
) {
	opacity: 0.6;
}

[data-brixter-placeholder-active]:not(img):not([data-brixter-field-enhanced='true']):is(
	a,
	button,
	[role='button'],
	[role='link']
) {
	opacity: 1;
	color: #9ca3af !important;
}

[data-brixter-placeholder-active]:not(img):not([data-brixter-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
),
[data-brixter-placeholder-active]:not(img):not([data-brixter-field-enhanced='true']):not(
	:is(a, button, [role='button'], [role='link'])
) *:not(.builder-preview-field-editor):not(.builder-preview-text-editor):not(.ProseMirror):not(.builder-richtext-inline-editor):not(.builder-richtext-mount) {
	color: #9ca3af !important;
}

[data-brixter-field-enhanced='true'] .builder-preview-text-editor,
[data-brixter-field-enhanced='true'] .ProseMirror,
[data-brixter-field-enhanced='true'] .builder-richtext-inline-editor,
[data-brixter-field-enhanced='true'] .builder-richtext-inline-editor p {
	color: var(--builder-preview-field-text-color, currentColor) !important;
	-webkit-text-fill-color: var(--builder-preview-field-text-color, currentColor);
	caret-color: var(--builder-preview-field-text-color, currentColor);
}

body[data-brixter-preview-page-overflow='true']::before {
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

[data-brixter-preview-overflow-item='true'] {
	outline: 2px solid #f59e0b !important;
	outline-offset: -2px;
}

[data-brixter-field][data-brixter-kind='icon']:empty::before {
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

body[data-brixter-preview-canvas] [data-brixter-field][data-brixter-kind='icon']:hover,
body[data-brixter-preview-canvas] [data-brixter-field][data-brixter-kind='icon'][data-brixter-field-enhanced='true'] {
	outline: 2px dashed #fde047 !important;
	outline-offset: 2px;
	border-radius: 4px;
}
.dark body[data-brixter-preview-canvas] [data-brixter-field][data-brixter-kind='icon']:hover,
.dark body[data-brixter-preview-canvas] [data-brixter-field][data-brixter-kind='icon'][data-brixter-field-enhanced='true'] {
	outline-color: #facc15 !important;
}
`;
		frameDocument.head.append(styleElement);

		const removeKeydownListener = syncFrameKeydown(frameDocument);
		const removeOverflowDiagnostic = syncPreviewOverflow(frameDocument);

		return () => {
			removeKeydownListener();
			removeOverflowDiagnostic();
			styleElement.remove();
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
				'data-brixter-preview-page-overflow',
				offenders.length > 0
			);

			for (const offender of offenders.slice(0, 20)) {
				offender.setAttribute('data-brixter-preview-overflow-item', 'true');
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
			frameDocument.body.removeAttribute('data-brixter-preview-page-overflow');
		};
	}

	function isOverflowDiagnosticMutation(record: MutationRecord): boolean {
		return (
			record.type === 'attributes' &&
			(record.attributeName === 'data-brixter-preview-overflow-item' ||
				record.attributeName === 'data-brixter-preview-page-overflow')
		);
	}

	function findPreviewOverflowElements(
		frameDocument: Document,
		viewportWidth: number
	): HTMLElement[] {
		const offenders = new Set<HTMLElement>();
		const contentRoots = Array.from(
			frameDocument.querySelectorAll<HTMLElement>('[data-brixter-preview-content]')
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
			frameDocument.querySelectorAll('[data-brixter-preview-overflow-item]')
		)) {
			element.removeAttribute('data-brixter-preview-overflow-item');
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
		class="block h-full border-0 transition-all duration-300 ease-in-out"
		class:w-full={viewportSize === 'desktop'}
		class:shadow-2xl={viewportSize !== 'desktop'}
		class:border={viewportSize !== 'desktop'}
		class:border-gray-200={viewportSize !== 'desktop'}
		class:dark:border-gray-800={viewportSize !== 'desktop'}
		class:rounded-md={viewportSize !== 'desktop'}
		style={viewportSize === 'tablet'
			? 'width: 768px;'
			: viewportSize === 'mobile'
				? 'width: 375px;'
				: ''}
	></iframe>
</div>
