<script lang="ts">
	import { tick } from 'svelte';

	let {
		value,
		multiline,
		textStyle,
		onChange,
		onBlur
	}: {
		value: string;
		multiline: boolean;
		textStyle: string;
		onChange: (value: string) => void;
		onBlur: () => void;
	} = $props();

	let element = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	$effect(() => {
		void focusEditor();
	});

	async function focusEditor(): Promise<void> {
		await tick();
		element?.focus();
		element?.select();
	}
</script>

{#if multiline}
	<textarea
		bind:this={element}
		value={value}
		class="builder-preview-text-editor resize-none"
		style={textStyle}
		oninput={(event) => onChange(event.currentTarget.value)}
		onblur={onBlur}></textarea>
{:else}
	<input
		bind:this={element}
		type="text"
		value={value}
		class="builder-preview-text-editor"
		style={textStyle}
		oninput={(event) => onChange(event.currentTarget.value)}
		onblur={onBlur} />
{/if}

<style>
	.builder-preview-text-editor {
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
</style>
