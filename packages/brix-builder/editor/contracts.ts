import type { Component } from 'svelte';
import type { BuilderBlock, BuilderDefinition, BuilderRichTextValue } from '../core.js';
import type { PreviewCollectionOverlay, PreviewOverlay } from '../preview-dom.js';

export interface BuilderRenderDefinition extends BuilderDefinition {
	component: Component<Record<string, unknown>>;
}

export type PreviewContainerAction = (
	node: HTMLElement,
	params: { block: BuilderBlock; definition: BuilderRenderDefinition }
) => {
	update: (nextParams: { block: BuilderBlock; definition: BuilderRenderDefinition }) => void;
	destroy: () => void;
};

export interface BuilderAppPreviewProps {
	definitions: BuilderRenderDefinition[];
	blocks: BuilderBlock[];
	propsErrors: Record<string, string | null>;
	previewOverlays: Record<string, PreviewOverlay[]>;
	previewCollectionOverlays: Record<string, PreviewCollectionOverlay[]>;
	activeBlockId: string | null;
	activeRichTextEdit: PreviewRichTextEdit | null;
	activeTextEdit: PreviewTextEdit | null;
	previewContainer: PreviewContainerAction;
	onPreviewClick: (block: BuilderBlock, event: MouseEvent) => void;
	onPreviewKeydown: (block: BuilderBlock, event: KeyboardEvent) => void;
	onSelectBlock: (blockId: string) => void;
	onCloseRichTextEdit: () => void;
	onCloseTextEdit: () => void;
	onUpdateRichText: (block: BuilderBlock, path: string, value: BuilderRichTextValue) => void;
	onUpdateText: (block: BuilderBlock, path: string, value: string) => void;
	onQueueFileEdit: (blockId: string, path: string) => void;
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
}

export interface PreviewRichTextEdit {
	blockId: string;
	path: string;
	selector: string;
	selectorIndex: number;
	mode: BuilderRichTextValue['mode'];
	top: number;
	left: number;
	width: number;
	minHeight: number;
	textStyle: string;
}

export interface PreviewTextEdit {
	blockId: string;
	path: string;
	selector: string;
	selectorIndex: number;
	top: number;
	left: number;
	width: number;
	minHeight: number;
	textStyle: string;
	multiline: boolean;
}
