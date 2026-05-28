<script lang="ts">
	import { onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import type { BuilderRichTextValue } from '../core.js';

	let {
		value,
		mode,
		chrome = 'panel',
		autofocus = false,
		editorStyle = '',
		onChange,
		onBlur = () => {}
	}: {
		value: BuilderRichTextValue;
		mode: BuilderRichTextValue['mode'];
		chrome?: 'panel' | 'inline';
		autofocus?: boolean;
		editorStyle?: string;
		onChange: (nextValue: BuilderRichTextValue) => void;
		onBlur?: () => void;
	} = $props();

	let element = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let lastSyncedHtml = $state('');

	onMount(() => {
		const initialHtml = getEditorContent(value.html, mode);
		lastSyncedHtml = value.html;

		editor = new Editor({
			element: element ?? undefined,
			autofocus,
			extensions: [
				StarterKit.configure({
					heading: mode === 'inline' ? false : undefined,
					bulletList: mode === 'inline' ? false : undefined,
					orderedList: mode === 'inline' ? false : undefined,
					blockquote: mode === 'inline' ? false : undefined,
					codeBlock: false,
					horizontalRule: mode === 'inline' ? false : undefined
				})
			],
			content: initialHtml,
			editorProps: {
				attributes: {
					class:
						chrome === 'inline'
							? 'builder-richtext-inline-editor'
							: mode === 'inline'
								? 'builder-richtext-panel-editor min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none'
								: 'builder-richtext-panel-editor min-h-32 rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none',
					style: editorStyle
				}
			},
			onBlur: () => {
				onBlur();
			},
			onUpdate: ({ editor: activeEditor }) => {
				const html = normalizeOutput(mode, activeEditor.getHTML());
				lastSyncedHtml = html;
				onChange({
					kind: 'richtext',
					mode,
					html,
					json: activeEditor.getJSON() as Record<string, unknown>
				});
			}
		});

		return () => {
			editor?.destroy();
			editor = null;
		};
	});

	$effect(() => {
		const nextHtml = value.html;
		if (editor && nextHtml !== lastSyncedHtml) {
			lastSyncedHtml = nextHtml;
			editor.commands.setContent(getEditorContent(nextHtml, mode), { emitUpdate: false });
		}
	});

	function getEditorContent(html: string, currentMode: BuilderRichTextValue['mode']): string {
		if (!html.trim()) {
			return '<p></p>';
		}

		if (currentMode === 'inline' && !html.trim().startsWith('<p')) {
			return `<p>${html}</p>`;
		}

		return html;
	}

	function normalizeOutput(htmlMode: BuilderRichTextValue['mode'], html: string): string {
		const trimmed = html.trim();
		if (trimmed === '<p></p>') {
			return '';
		}

		if (htmlMode !== 'inline') {
			return trimmed;
		}

		const paragraphMatch = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
		return paragraphMatch ? paragraphMatch[1] : trimmed;
	}
</script>

<div bind:this={element}></div>

<style>
	:global(.builder-richtext-panel-editor) {
		width: 100%;
	}

	:global(.builder-richtext-inline-editor) {
		width: 100%;
		min-height: inherit;
		border: 0;
		background: transparent;
		padding: 0;
		outline: none;
		box-shadow: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		text-align: inherit;
	}

	:global(.builder-richtext-inline-editor > *:first-child) {
		margin-top: 0;
	}

	:global(.builder-richtext-inline-editor > *:last-child) {
		margin-bottom: 0;
	}

	:global(.builder-richtext-inline-editor p) {
		margin: 0;
	}
</style>
