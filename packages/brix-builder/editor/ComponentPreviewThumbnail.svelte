<script lang="ts">
	import { mount, unmount } from 'svelte';
	import { createBuilderFallbackProps, normalizeBuilderPropsForRender } from '../core.js';
	import type { BuilderRenderDefinition } from './contracts.js';

	let { definition }: { definition: BuilderRenderDefinition } = $props();

	function thumbnailFrame(node: HTMLIFrameElement): { update: () => void; destroy: () => void } {
		let renderer: Record<string, unknown> | null = null;
		let cleanupHeadSync: (() => void) | null = null;
		let destroyed = false;
		const sourceDocument = node.ownerDocument;

		void render();

		async function render(): Promise<void> {
			const frameDocument = node.contentDocument;
			if (!frameDocument) {
				return;
			}

			if (renderer) {
				await unmount(renderer);
				renderer = null;
			}
			cleanupHeadSync?.();
			cleanupHeadSync = null;

			frameDocument.open();
			frameDocument.write(`<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<base href="${escapeHtml(sourceDocument.baseURI)}">
	</head>
	<body>
		<div id="component-preview-stage">
			<div id="component-preview-root"></div>
		</div>
	</body>
</html>`);
			frameDocument.close();

			await Promise.resolve();
			if (destroyed) {
				return;
			}

			setupFrameDocument(frameDocument, sourceDocument);
			cleanupHeadSync = syncHeadAssets(frameDocument, sourceDocument);

			const target = frameDocument.getElementById('component-preview-root');
			if (!target) {
				return;
			}

			renderer = mount(definition.component, {
				target,
				props: normalizeBuilderPropsForRender(createBuilderFallbackProps(definition)) as Record<
					string,
					unknown
				>
			}) as Record<string, unknown>;
		}

		return {
			update() {
				void render();
			},
			destroy() {
				destroyed = true;
				cleanupHeadSync?.();
				cleanupHeadSync = null;
				if (renderer) {
					void unmount(renderer);
					renderer = null;
				}
			}
		};
	}

	function setupFrameDocument(frameDocument: Document, sourceDocument: Document): void {
		const styleElement = frameDocument.createElement('style');
		styleElement.textContent = `
html,
body,
#component-preview-stage {
	margin: 0;
	min-height: 100%;
}

body {
	background: transparent;
	color: #1e1c18;
	overflow: hidden;
}

* {
	scrollbar-width: none;
}

*::-webkit-scrollbar {
	display: none;
}

body.dark {
	background: transparent;
	color: #f3f4f6;
}

#component-preview-stage {
	box-sizing: border-box;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 640px;
	padding: 32px;
	background:
		linear-gradient(90deg, rgba(15, 23, 42, 0.07) 1px, transparent 1px),
		linear-gradient(0deg, rgba(15, 23, 42, 0.07) 1px, transparent 1px),
		radial-gradient(circle at top left, rgba(253, 224, 71, 0.18), transparent 34%),
		linear-gradient(135deg, #fafaf5 0%, #fef9c3 100%);
	background-size:
		24px 24px,
		24px 24px,
		auto,
		auto;
}

.dark #component-preview-stage {
	background:
		linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
		linear-gradient(0deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
		radial-gradient(circle at top left, rgba(253, 224, 71, 0.24), transparent 34%),
		linear-gradient(135deg, #12100d 0%, #2d2a25 100%);
	background-size:
		24px 24px,
		24px 24px,
		auto,
		auto;
}

#component-preview-root {
	width: 100%;
}
`;
		frameDocument.head.append(styleElement);
		syncThemeClass(frameDocument, sourceDocument);
	}

	function syncHeadAssets(frameDocument: Document, sourceDocument: Document): () => void {
		for (const asset of sourceDocument.head.querySelectorAll(
			'link[rel="stylesheet"], link[rel="preconnect"], style'
		)) {
			const clone = asset.cloneNode(true) as HTMLElement;
			if (asset instanceof HTMLLinkElement && clone instanceof HTMLLinkElement && asset.href) {
				clone.href = asset.href;
			}
			frameDocument.head.append(clone);
		}

		return () => {
			for (const asset of Array.from(frameDocument.head.children)) {
				asset.remove();
			}
		};
	}

	function syncThemeClass(frameDocument: Document, sourceDocument: Document): void {
		const isDark =
			sourceDocument.documentElement.classList.contains('dark') ||
			sourceDocument.body.classList.contains('dark');
		frameDocument.documentElement.classList.toggle('dark', isDark);
		frameDocument.body.classList.toggle('dark', isDark);
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
	class="relative h-48 w-full overflow-hidden border border-gray-200 bg-[radial-gradient(circle_at_top_left,rgba(253,224,71,0.18),transparent_34%),linear-gradient(135deg,#fafaf5_0%,#fef9c3_100%)] dark:border-gray-700 dark:bg-[radial-gradient(circle_at_top_left,rgba(253,224,71,0.24),transparent_34%),linear-gradient(135deg,#12100d_0%,#2d2a25_100%)]"
>
	<iframe
		use:thumbnailFrame
		title={`Anteprima ${definition.type}`}
		scrolling="no"
		class="pointer-events-none absolute top-0 left-0 h-[640px] w-full origin-top-left scale-[0.3] border-0 bg-transparent"
		style="width: 333.333%;"
	></iframe>
</div>
