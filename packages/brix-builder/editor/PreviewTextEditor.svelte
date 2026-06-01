<script lang="ts">
	import { onMount, tick } from 'svelte';

	let {
		value,
		placeholder = '',
		multiline = false,
		inline = false,
		textStyle,
		autofocus = false,
		initialCaretOffset = null,
		initialClickCoords = null,
		onChange,
		onBlur
	}: {
		value: string;
		placeholder?: string;
		multiline?: boolean;
		inline?: boolean;
		textStyle: string;
		autofocus?: boolean;
		initialCaretOffset?: number | null;
		initialClickCoords?: { left: number; top: number } | null;
		onChange: (value: string) => void;
		onBlur: () => void;
	} = $props();

	let element = $state<HTMLDivElement | null>(null);
	let draft = $state(value);

	$effect(() => {
		const nextValue = value;
		if (!element) {
			return;
		}

		if (element.ownerDocument.activeElement === element) {
			return;
		}

		draft = nextValue;
		element.textContent = nextValue;
		updateEmptyState();
	});

	onMount(() => {
		if (!element) {
			return;
		}

		element.textContent = value;
		draft = value;
		updateEmptyState();

		if (autofocus) {
			void placeInitialSelection();
		}
	});

	function readPlainText(node: HTMLElement): string {
		return node.innerText.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
	}

	function updateEmptyState(): void {
		if (!element) {
			return;
		}

		element.classList.toggle('is-editor-empty', draft.trim().length === 0);
	}

	function emitChange(): void {
		if (!element) {
			return;
		}

		draft = readPlainText(element);
		updateEmptyState();
		onChange(draft);
	}

	function handlePaste(event: ClipboardEvent): void {
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') ?? '';
		insertPlainText(text);
		emitChange();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!multiline && event.key === 'Enter') {
			event.preventDefault();
		}
	}

	function insertPlainText(text: string): void {
		if (!element) {
			return;
		}

		const doc = element.ownerDocument;
		const selection = doc.getSelection();
		if (!selection || selection.rangeCount === 0) {
			element.textContent = (element.textContent ?? '') + text;
			return;
		}

		const range = selection.getRangeAt(0);
		range.deleteContents();
		range.insertNode(doc.createTextNode(text));
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	async function placeInitialSelection(): Promise<void> {
		await tick();
		if (!element) {
			return;
		}

		element.focus();

		const doc = element.ownerDocument;
		const selection = doc.getSelection();
		if (!selection) {
			return;
		}

		if (initialClickCoords) {
			const range =
				doc.caretRangeFromPoint?.(initialClickCoords.left, initialClickCoords.top) ??
				(() => {
					const pos = doc.caretPositionFromPoint?.(
						initialClickCoords.left,
						initialClickCoords.top
					);
					if (!pos) {
						return null;
					}

					const nextRange = doc.createRange();
					nextRange.setStart(pos.offsetNode, pos.offset);
					nextRange.collapse(true);
					return nextRange;
				})();

			if (range && element.contains(range.startContainer)) {
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}
		}

		if (initialCaretOffset != null) {
			setCaretAtOffset(element, initialCaretOffset, selection);
		}
	}

	function setCaretAtOffset(
		root: HTMLElement,
		offset: number,
		selection: Selection
	): void {
		const doc = root.ownerDocument;
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let remaining = offset;

		while (walker.nextNode()) {
			const textNode = walker.currentNode as Text;
			if (remaining <= textNode.length) {
				const range = doc.createRange();
				range.setStart(textNode, remaining);
				range.collapse(true);
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}

			remaining -= textNode.length;
		}

		const range = doc.createRange();
		range.selectNodeContents(root);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}
</script>

<div
	bind:this={element}
	class="builder-preview-text-editor"
	class:is-editor-empty={!draft.trim()}
	class:builder-preview-text-editor--inline={inline}
	class:builder-preview-text-editor--multiline={multiline}
	contenteditable="plaintext-only"
	role="textbox"
	aria-multiline={multiline}
	data-placeholder={placeholder}
	style={textStyle}
	oninput={emitChange}
	onpaste={handlePaste}
	onkeydown={handleKeydown}
	onblur={onBlur}
></div>

<style>
	.builder-preview-text-editor {
		width: 100%;
		min-height: inherit;
		margin: 0;
		border: 0;
		background: transparent;
		padding: 0;
		outline: none;
		box-shadow: none;
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

	.builder-preview-text-editor--inline {
		display: inline;
		width: auto;
		min-width: 1ch;
		vertical-align: baseline;
	}

	.builder-preview-text-editor--multiline {
		display: block;
		white-space: pre-wrap;
	}

	.builder-preview-text-editor.is-editor-empty::before {
		content: attr(data-placeholder);
		color: #9ca3af;
		opacity: 0.6;
		pointer-events: none;
	}
</style>
