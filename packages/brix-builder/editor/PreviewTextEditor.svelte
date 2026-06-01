<script lang="ts">
	import { onMount, tick } from 'svelte';

	let {
		value,
		placeholder = '',
		multiline,
		textStyle,
		autofocus = false,
		initialCaretOffset = null,
		initialClickCoords = null,
		onChange,
		onBlur
	}: {
		value: string;
		placeholder?: string;
		multiline: boolean;
		textStyle: string;
		autofocus?: boolean;
		initialCaretOffset?: number | null;
		initialClickCoords?: { left: number; top: number } | null;
		onChange: (value: string) => void;
		onBlur: () => void;
	} = $props();

	let element = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let draft = $state(value);

	$effect(() => {
		draft = value;
	});

	onMount(() => {
		if (autofocus) {
			void placeInitialSelection();
		}
	});

	async function placeInitialSelection(): Promise<void> {
		await tick();
		if (!element) {
			return;
		}

		element.focus();

		if (initialClickCoords) {
			const doc = element.ownerDocument;
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
				const start = range.startOffset;
				element.setSelectionRange(start, start);
				return;
			}
		}

		if (initialCaretOffset != null) {
			const offset = Math.min(initialCaretOffset, draft.length);
			element.setSelectionRange(offset, offset);
		}
	}

	function handleInput(event: Event): void {
		const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
		draft = target.value;
		onChange(draft);
	}
</script>

{#if multiline}
	<textarea
		bind:this={element}
		value={draft}
		placeholder={placeholder}
		class="builder-preview-text-editor resize-none"
		style={textStyle}
		oninput={handleInput}
		onblur={onBlur}></textarea>
{:else}
	<input
		bind:this={element}
		type="text"
		value={draft}
		placeholder={placeholder}
		class="builder-preview-text-editor"
		style={textStyle}
		oninput={handleInput}
		onblur={onBlur} />
{/if}

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
		color: inherit;
		font: inherit;
		line-height: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		text-align: inherit;
		white-space: inherit;
		cursor: text;
		field-sizing: content;
	}
</style>
