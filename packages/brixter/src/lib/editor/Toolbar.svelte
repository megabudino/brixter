<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Editor, EditorEvents } from '@tiptap/core';
	import {
		Code,
		Quote,
		List,
		ListOrdered,
		Heading1,
		Heading2,
		Heading3,
		Pilcrow,
		Minus,
		Image as ImageIcon,
		FileCode
	} from 'lucide-svelte';

	let {
		editor = null,
		uploadImage = null,
		onimageInserted,
		onpickImage,
		htmlBlockFocused = false
	}: {
		editor?: Editor | null;
		uploadImage?: ((file: File) => Promise<string>) | null;
		onimageInserted?: (detail: { imageUrl: string; fileName: string }) => void;
		onpickImage?: (() => void) | null;
		htmlBlockFocused?: boolean;
	} = $props();

	// Active states
	// inline formatting states are now handled by InlineToolbar
	let isParagraphActive = $state(false);
	let isHeading1Active = $state(false);
	let isHeading2Active = $state(false);
	let isHeading3Active = $state(false);
	let isBulletListActive = $state(false);
	let isOrderedListActive = $state(false);
	let isBlockquoteActive = $state(false);
	let isCodeBlockActive = $state(false);
	let isHtmlBlockActive = $state(false);
	let isHorizontalRuleActive = $state(false);
	let isImageActive = $state(false);
	let isAtomActive = $state(false);
	let canInsertBlock = $state(false);

	function refreshActiveStates() {
		if (!editor) return;
		isHeading1Active = editor.isActive('heading', { level: 1 });
		isHeading2Active = editor.isActive('heading', { level: 2 });
		isHeading3Active = editor.isActive('heading', { level: 3 });
		isBulletListActive = editor.isActive('bulletList');
		isOrderedListActive = editor.isActive('orderedList');
		isBlockquoteActive = editor.isActive('blockquote');
		isCodeBlockActive = editor.isActive('codeBlock');
		isParagraphActive =
			editor.isActive('paragraph') &&
			!isHeading2Active &&
			!isHeading3Active &&
			!isBulletListActive &&
			!isOrderedListActive &&
			!isBlockquoteActive &&
			!isCodeBlockActive;
		isHtmlBlockActive = editor.isActive('htmlBlock');
		isHorizontalRuleActive = editor.isActive('horizontalRule');
		isImageActive = editor.isActive('customImage');
		isAtomActive = isHtmlBlockActive || isHorizontalRuleActive || isImageActive;
		const selFrom = editor.state.selection.$from;
		const node = selFrom.parent;
		canInsertBlock = !isAtomActive && selFrom.depth === 1 && node.type.name === 'paragraph' && node.content.size === 0;
	}

	let currentEditor: Editor | null = null;
	let handlerSelection: (() => void) | null = null;
	let handlerTxn: (() => void) | null = null;
	let handlerFocus: (() => void) | null = null;
	let handlerBlur: ((args: EditorEvents['blur']) => void) | null = null;

	function attach() {
		if (!editor) return;
		currentEditor = editor;
		handlerSelection = () => refreshActiveStates();
		handlerTxn = () => refreshActiveStates();
		handlerFocus = () => refreshActiveStates();
		handlerBlur = ({ event }: EditorEvents['blur']) => {
			const target = event?.relatedTarget as HTMLElement | null;
			const inHtmlBlock = !!target?.closest('.html-block');
			isParagraphActive = false;
			isHeading1Active = false;
			isHeading2Active = false;
			isHeading3Active = false;
			isBulletListActive = false;
			isOrderedListActive = false;
			isBlockquoteActive = false;
			isCodeBlockActive = false;
			isHtmlBlockActive = inHtmlBlock;
			isHorizontalRuleActive = false;
			isImageActive = false;
			isAtomActive = inHtmlBlock;
			canInsertBlock = false;
		};
		currentEditor.on('selectionUpdate', handlerSelection);
		currentEditor.on('transaction', handlerTxn);
		currentEditor.on('focus', handlerFocus);
		currentEditor.on('blur', handlerBlur);
	}

	function detach() {
		if (!currentEditor) return;
		if (handlerSelection) currentEditor.off('selectionUpdate', handlerSelection);
		if (handlerTxn) currentEditor.off('transaction', handlerTxn);
		if (handlerFocus) currentEditor.off('focus', handlerFocus);
		if (handlerBlur) currentEditor.off('blur', handlerBlur);
		handlerSelection = handlerTxn = handlerFocus = handlerBlur = null;
		currentEditor = null;
	}

	$effect(() => {
		if (editor) {
			refreshActiveStates();
		}
	});

	$effect(() => {
		if (htmlBlockFocused) {
			isParagraphActive = false;
			isHeading1Active = false;
			isHeading2Active = false;
			isHeading3Active = false;
			isBulletListActive = false;
			isOrderedListActive = false;
			isBlockquoteActive = false;
			isCodeBlockActive = false;
			isHtmlBlockActive = true;
			isAtomActive = true;
		}
	});

	onMount(() => {
		refreshActiveStates();
		attach();
	});

	onDestroy(() => {
		detach();
	});

	$effect(() => {
		if (editor && editor !== currentEditor) {
			detach();
			attach();
			refreshActiveStates();
		}
	});

	// link and inline formatting handled by InlineToolbar

	function setParagraphBlock() {
		if (!editor) return;
		const chain = editor.chain().focus();
		if (editor.isActive('bulletList')) chain.toggleBulletList();
		if (editor.isActive('orderedList')) chain.toggleOrderedList();
		if (editor.isActive('blockquote')) chain.toggleBlockquote();
		if (editor.isActive('codeBlock')) chain.toggleCodeBlock();
		chain.setParagraph().run();
	}

	async function chooseAndInsertImage() {
		if (!editor) return;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async (event) => {
			const target = event.target as HTMLInputElement;
			if (!target.files || !target.files[0]) return;
			const file = target.files[0];

			if (!file.type.startsWith('image/')) {
				alert('Per favore seleziona un file immagine valido.');
				target.value = '';
				return;
			}
			if (file.size > 10 * 1024 * 1024) {
				alert("L'immagine è troppo grande. La dimensione massima è 10MB.");
				target.value = '';
				return;
			}

			try {
				let imageUrl = '';
				if (uploadImage) {
					imageUrl = await uploadImage(file);
				} else {
					// If no uploader provided, create a blob URL so at least something shows up.
					imageUrl = URL.createObjectURL(file);
				}
				if (imageUrl) {
					editor.chain().focus().insertContent(`<img src="${imageUrl}" alt="">`).run();
					onimageInserted?.({ imageUrl, fileName: file.name });
				}
			} finally {
				target.value = '';
			}
		};
		input.click();
	}


</script>

{#if editor}
	<div class="toolbar flex flex-shrink-0 justify-center text-gray-500 dark:text-gray-400">
		<!-- Block type selection (radio-like) -->
		<div class="toolbar-group">
			<button
				onclick={setParagraphBlock}
				class:active={isParagraphActive}
				disabled={isAtomActive}
				title="Paragraph"
			>
				<Pilcrow size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				class:active={isHeading1Active}
				disabled={isAtomActive}
				title="Heading 1"
			>
				<Heading1 size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				class:active={isHeading2Active}
				disabled={isAtomActive}
				title="Heading 2"
			>
				<Heading2 size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				class:active={isHeading3Active}
				disabled={isAtomActive}
				title="Heading 3"
			>
				<Heading3 size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleBulletList().run()}
				class:active={isBulletListActive}
				disabled={isAtomActive}
				title="Bullet List"
			>
				<List size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleOrderedList().run()}
				class:active={isOrderedListActive}
				disabled={isAtomActive}
				title="Numbered List"
			>
				<ListOrdered size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleBlockquote().run()}
				class:active={isBlockquoteActive}
				disabled={isAtomActive}
				title="Blockquote"
			>
				<Quote size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
				class:active={isCodeBlockActive}
				disabled={isAtomActive}
				title="Code Block"
			>
				<Code size={16} />
			</button>
		</div>

		<div class="toolbar-divider bg-gray-200 dark:bg-gray-700"></div>

		<!-- Insert buttons -->
		<div class="toolbar-group">
			<button
				onclick={() => (onpickImage ? onpickImage() : chooseAndInsertImage())}
				class:active={isImageActive}
				disabled={!canInsertBlock && !isImageActive}
				title="Insert image"
			>
				<ImageIcon size={16} />
			</button>
			<button
				onclick={() => editor?.chain().focus().setHorizontalRule().run()}
				class:active={isHorizontalRuleActive}
				disabled={!canInsertBlock && !isHorizontalRuleActive}
				title="Horizontal Rule"
			>
				<Minus size={16} />
			</button>
			<button
				onclick={() => (editor?.commands as any).toggleHtmlBlock()}
				class:active={isHtmlBlockActive}
				disabled={!canInsertBlock && !isHtmlBlockActive}
				title="HTML Block (Ctrl+Shift+M)"
			>
				<FileCode size={16} />
			</button>
		</div>

		<!--
    <div class="toolbar-divider bg-gray-200 dark:bg-gray-700"></div>
    <div class="toolbar-group">
      <button onclick={() => editor?.chain().focus().setTextAlign('left').run()} class:active={isAlignLeftActive} title="Align Left">
        <AlignLeft size={16} />
      </button>
      <button onclick={() => editor?.chain().focus().setTextAlign('center').run()} class:active={isAlignCenterActive} title="Align Center">
        <AlignCenter size={16} />
      </button>
      <button onclick={() => editor?.chain().focus().setTextAlign('right').run()} class:active={isAlignRightActive} title="Align Right">
        <AlignRight size={16} />
      </button>
      <button onclick={() => editor?.chain().focus().setTextAlign('justify').run()} class:active={isAlignJustifyActive} title="Justify">
        <AlignJustify size={16} />
      </button>
    </div>
    -->
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		border-radius: 50px;
		width: fit-content;
		margin: 0 auto;
		position: sticky;
		top: 16px;
		z-index: 100;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.toolbar-divider {
		margin: 0 0.5rem;
		height: 1.5rem;
		width: 1px;
	}

	.toolbar button {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		padding: 0.5rem;
		border: 1px solid transparent;
		transition: all 0.15s ease-in-out;
	}

	.toolbar button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.toolbar button:hover:not(:disabled) {
		background-color: #f3f4f6;
		color: #1e1c18;
	}

	:global(.dark) .toolbar button:hover:not(:disabled) {
		background-color: #444039;
		color: #f9fafb;
	}

	.toolbar button.active {
		background-color: #facc15 !important;
		color: white !important;
		border: 1px solid #facc15 !important;
		box-shadow: 0 2px 4px rgba(253, 224, 71, 0.3) !important;
	}

	.toolbar button.active:hover {
		background-color: #fde047 !important;
		border-color: #fde047 !important;
		box-shadow: 0 4px 8px rgba(253, 224, 71, 0.4) !important;
	}
</style>
