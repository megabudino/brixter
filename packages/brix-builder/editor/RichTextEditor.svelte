<script lang="ts">
	import { onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import type { BuilderRichTextValue } from '../core.js';

	let {
		value,
		mode,
		placeholder = '',
		chrome = 'panel',
		plainTextOnly = false,
		hostInline = false,
		autofocus = false,
		initialCaretOffset = null,
		initialClickCoords = null,
		editorStyle = '',
		onChange,
		onBlur = () => {}
	}: {
		value: BuilderRichTextValue;
		mode: BuilderRichTextValue['mode'];
		placeholder?: string;
		chrome?: 'panel' | 'inline';
		plainTextOnly?: boolean;
		hostInline?: boolean;
		autofocus?: boolean;
		initialCaretOffset?: number | null;
		initialClickCoords?: { left: number; top: number } | null;
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
			autofocus: false,
			extensions: [
				StarterKit.configure({
					heading: mode === 'inline' || plainTextOnly ? false : undefined,
					bulletList: mode === 'inline' || plainTextOnly ? false : undefined,
					orderedList: mode === 'inline' || plainTextOnly ? false : undefined,
					blockquote: mode === 'inline' || plainTextOnly ? false : undefined,
					codeBlock: false,
					horizontalRule: mode === 'inline' || plainTextOnly ? false : undefined,
					bold: plainTextOnly ? false : undefined,
					italic: plainTextOnly ? false : undefined,
					strike: plainTextOnly ? false : undefined,
					code: plainTextOnly ? false : undefined
				})
			],
			content: initialHtml,
			editorProps: {
				attributes: {
					class:
						chrome === 'inline'
							? `builder-richtext-inline-editor${hostInline ? ' builder-richtext-inline-editor--host-inline' : ''}`
							: mode === 'inline'
								? 'builder-richtext-panel-editor min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]'
								: 'builder-richtext-panel-editor min-h-32 border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]',
					style: editorStyle,
					'data-placeholder': placeholder
				},
				handleKeyDown: (_view, event) => {
					if (plainTextOnly && event.key === 'Enter') {
						event.preventDefault();
						return true;
					}

					return false;
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
				activeEditor.view.dom.classList.toggle('is-editor-empty', activeEditor.isEmpty);
			},
			onCreate: ({ editor: activeEditor }) => {
				activeEditor.view.dom.classList.toggle('is-editor-empty', activeEditor.isEmpty);
				if (autofocus) {
					placeInitialSelection(activeEditor);
				}
			}
		});

		return () => {
			editor?.destroy();
			editor = null;
		};
	});

	$effect(() => {
		const nextHtml = value.html;
		if (editor && !editor.isFocused && nextHtml !== lastSyncedHtml) {
			lastSyncedHtml = nextHtml;
			editor.commands.setContent(getEditorContent(nextHtml, mode), { emitUpdate: false });
			editor.view.dom.classList.toggle('is-editor-empty', editor.isEmpty);
		}
	});

	function placeInitialSelection(activeEditor: Editor): void {
		if (initialClickCoords) {
			const pos = activeEditor.view.posAtCoords(initialClickCoords)?.pos;
			if (pos != null) {
				activeEditor.chain().focus().setTextSelection(pos).run();
				return;
			}
		}

		if (initialCaretOffset != null && initialCaretOffset > 0) {
			const docSize = activeEditor.state.doc.content.size;
			const pos = Math.min(initialCaretOffset + 1, Math.max(1, docSize - 1));
			activeEditor.chain().focus().setTextSelection(pos).run();
			return;
		}

		if (hostInline && activeEditor.isEmpty) {
			activeEditor.chain().focus().setTextSelection(1).run();
			return;
		}

		activeEditor.commands.focus();
	}

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

<div bind:this={element} class={chrome === 'inline' ? 'builder-richtext-mount' : undefined}></div>

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
		margin: 0;
		outline: none;
		box-shadow: none;
		color: inherit;
		font: inherit;
		line-height: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		text-align: inherit;
		white-space: inherit;
		word-wrap: inherit;
		overflow-wrap: inherit;
		cursor: text;
	}

	:global(.builder-richtext-mount) {
		display: contents;
	}

	:global(.builder-richtext-inline-editor > *:first-child) {
		margin-top: 0;
	}

	:global(.builder-richtext-inline-editor > *:last-child) {
		margin-bottom: 0;
	}

	:global(.builder-richtext-inline-editor p) {
		margin: 0;
		padding: 0;
		line-height: inherit;
	}

	:global(.builder-richtext-inline-editor--host-inline) {
		display: block;
		width: 100%;
		min-height: 1lh;
		vertical-align: baseline;
		position: relative;
		white-space: nowrap;
	}

	:global(.builder-richtext-inline-editor--host-inline p) {
		display: block;
		margin: 0;
		padding: 0;
		min-height: inherit;
	}

	:global(.builder-richtext-inline-editor--host-inline .ProseMirror-trailingBreak) {
		display: none;
	}
</style>
