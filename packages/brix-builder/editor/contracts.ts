import type { Component } from 'svelte';
import type { BuilderBlock, BuilderDefinition, BuilderRichTextValue } from '../core.js';
import type { PreviewCollectionOverlay, PreviewOverlay } from '../preview-dom.js';

export interface BuilderRenderDefinition extends BuilderDefinition {
	component: Component<Record<string, unknown>>;
}

export interface PreviewFieldEdit {
	blockId: string;
	path: string;
	caretOffset?: number | null;
}

export interface PreviewEditingContext {
	active: boolean;
	focusPath: string | null;
	caretOffset: number | null;
	previewProps: Record<string, unknown>;
}

export type PreviewContainerAction = (
	node: HTMLElement,
	params: {
		block: BuilderBlock;
		definition: BuilderRenderDefinition;
		editing: PreviewEditingContext;
	}
) => {
	update: (nextParams: {
		block: BuilderBlock;
		definition: BuilderRenderDefinition;
		editing: PreviewEditingContext;
	}) => void;
	destroy: () => void;
};

export interface BuilderAppPreviewProps {
	definitions: BuilderRenderDefinition[];
	blocks: BuilderBlock[];
	propsErrors: Record<string, string | null>;
	previewOverlays: Record<string, PreviewOverlay[]>;
	previewCollectionOverlays: Record<string, PreviewCollectionOverlay[]>;
	activeBlockId: string | null;
	activeFieldEdit: PreviewFieldEdit | null;
	previewContainer: PreviewContainerAction;
	onPreviewClick: (block: BuilderBlock, event: MouseEvent) => void;
	onPreviewKeydown: (block: BuilderBlock, event: KeyboardEvent) => void;
	onSelectBlock: (blockId: string) => void;
	onCloseFieldEdit: () => void;
	onUpdateRichText: (block: BuilderBlock, path: string, value: BuilderRichTextValue) => void;
	onUpdateText: (block: BuilderBlock, path: string, value: string) => void;
	onQueueFileEdit: (blockId: string, path: string) => void;
	onAddBlockBefore: (blockId: string, type: string) => void;
	onAddBlockAfter: (blockId: string, type: string) => void;
	onAddItem: (block: BuilderBlock, collectionPath: string) => void;
	onRemoveItem: (block: BuilderBlock, collectionPath: string, index: number) => void;
	onMoveItem: (
		block: BuilderBlock,
		collectionPath: string,
		index: number,
		direction: -1 | 1
	) => void;
	onOpenReorderModal: (blockId: string, collectionPath: string) => void;
	onOpenInserterModal: (blockId: string, placement: 'before' | 'after') => void;
	onDeselectBlock: () => void;
	previewMode?: boolean;
	viewportSize?: 'desktop' | 'tablet' | 'mobile';
}
