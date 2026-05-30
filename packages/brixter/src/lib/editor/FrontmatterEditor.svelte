<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';

	let {
		value = '',
		fullscreen = false,
		onchange,
	}: {
		value?: string;
		fullscreen?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let editor: any = null;
	let expanded = $state(false);
	let mounted = $state(false);
	let dark = $state(browser ? document.body.classList.contains('dark') : true);
	let monacoModule: typeof import('monaco-editor') | null = null;

	$effect(() => {
		if (!browser) return;
		const observer = new MutationObserver(() => {
			const isDark = document.body.classList.contains('dark');
			if (isDark !== dark) {
				dark = isDark;
				if (editor && monacoModule) {
					monacoModule.editor.setTheme(dark ? 'brixter-dark' : 'brixter-light');
				}
			}
		});
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	function defineThemes(monaco: typeof import('monaco-editor')) {
		monaco.editor.defineTheme('brixter-dark', {
			base: 'vs-dark',
			inherit: true,
			rules: [
				{ token: 'type', foreground: '93C5FD' },
				{ token: 'string', foreground: '6EE7B7' },
				{ token: 'number', foreground: 'FCA5A5' },
				{ token: 'keyword', foreground: 'C4B5FD' },
				{ token: 'comment', foreground: '6B7280' },
			],
			colors: {
				'editor.background': '#111827',
				'editorGutter.background': '#0D1117',
				'editor.foreground': '#E5E7EB',
				'editor.lineHighlightBackground': '#1F293780',
				'editor.selectionBackground': '#2563EB40',
				'editorLineNumber.foreground': '#6B7280',
				'editorLineNumber.activeForeground': '#D1D5DB',
				'editorCursor.foreground': '#3B82F6',
				'editor.selectionHighlightBackground': '#2563EB20',
				'editorIndentGuide.background': '#1F2937',
				'editorIndentGuide.activeBackground': '#374151',
				'editorWidget.background': '#1F2937',
				'editorWidget.border': '#374151',
				'input.background': '#1F2937',
				'input.border': '#374151',
			}
		});

		monaco.editor.defineTheme('brixter-light', {
			base: 'vs',
			inherit: true,
			rules: [
				{ token: 'type', foreground: '2563EB' },
				{ token: 'string', foreground: '059669' },
				{ token: 'number', foreground: 'DC2626' },
				{ token: 'keyword', foreground: '7C3AED' },
				{ token: 'comment', foreground: '9CA3AF' },
			],
			colors: {
				'editor.background': '#FFFFFF',
				'editorGutter.background': '#F3F4F6',
				'editor.foreground': '#111827',
				'editor.lineHighlightBackground': '#F9FAFB',
				'editor.selectionBackground': '#2563EB30',
				'editorLineNumber.foreground': '#9CA3AF',
				'editorLineNumber.activeForeground': '#4B5563',
				'editorCursor.foreground': '#2563EB',
				'editor.selectionHighlightBackground': '#2563EB15',
				'editorIndentGuide.background': '#F3F4F6',
				'editorIndentGuide.activeBackground': '#E5E7EB',
				'editorWidget.background': '#FFFFFF',
				'editorWidget.border': '#E5E7EB',
				'input.background': '#FFFFFF',
				'input.border': '#D1D5DB',
			}
		});
	}

	async function initMonaco() {
		if (!browser || editor) return;
		await tick();
		const monaco = await import('monaco-editor');
		monacoModule = monaco;

		self.MonacoEnvironment = {
			getWorker: () => new Worker(
				new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
				{ type: 'module' }
			)
		};

		defineThemes(monaco);

		editor = monaco.editor.create(container, {
			value,
			language: 'yaml',
			theme: dark ? 'brixter-dark' : 'brixter-light',
			minimap: { enabled: false },
			lineNumbers: fullscreen ? 'on' : 'off',
			scrollBeyondLastLine: false,
			fontSize: fullscreen ? 14 : 13,
			tabSize: 2,
			wordWrap: 'on',
			automaticLayout: true,
			overviewRulerLanes: 0,
			hideCursorInOverviewRuler: true,
			renderLineHighlight: fullscreen ? 'line' : 'none',
			scrollbar: fullscreen ? { vertical: 'auto', horizontal: 'auto' } : { vertical: 'hidden', horizontal: 'hidden' },
			padding: { top: 16, bottom: 16 },
		});

		editor.onDidChangeModelContent(() => {
			onchange?.(editor.getValue());
		});

		if (!fullscreen) {
			const updateHeight = () => {
				const contentHeight = Math.min(400, Math.max(80, editor.getContentHeight()));
				container.style.height = `${contentHeight}px`;
				editor.layout();
			};
			editor.onDidContentSizeChange(updateHeight);
			updateHeight();
		}

		mounted = true;
	}

	$effect(() => {
		if ((fullscreen || expanded) && !editor) {
			initMonaco();
		}
	});

	onDestroy(() => {
		editor?.dispose();
	});

	export function getValue(): string {
		return editor?.getValue() ?? value;
	}
</script>

{#if fullscreen}
	<div bind:this={container} class="h-full"></div>
{:else}
	<div class="border-b border-gray-200 dark:border-gray-700">
		<button
			type="button"
			onclick={() => expanded = !expanded}
			class="w-full flex items-center justify-between px-4 py-2 text-sm text-muted hover:text-heading transition-colors cursor-pointer"
		>
			<span class="font-medium">Frontmatter</span>
			<span class="text-xs">{expanded ? '▲ Collapse' : '▼ Expand'}</span>
		</button>
		<div class="px-4 pb-3" class:hidden={!expanded}>
			<div bind:this={container} class="border border-gray-200 dark:border-gray-700" style="height: 150px;"></div>
		</div>
	</div>
{/if}
