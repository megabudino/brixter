import {
	addCollectionItem,
	createBlock,
	createBuilderDocument,
	getCollectionItems,
	moveCollectionItem,
	removeCollectionItem,
	reorderCollectionItem,
	updatePropsAtPath,
	type BuilderBlock,
	type BuilderCollection,
	type BuilderDefinition,
	type BuilderDocument
} from './core.js';

export interface ReorderModalState {
	blockId: string;
	collectionPath: string;
}

export interface DraggedCollectionItemState {
	blockId: string;
	collectionPath: string;
	index: number;
}

export interface PendingFileEditState {
	/** `null` targets a page-level metadata field instead of a block. */
	blockId: string | null;
	path: string;
}

export interface EditorControllerState {
	document: BuilderDocument;
	draggedBlockId: string | null;
	copied: boolean;
	propsErrors: Record<string, string | null>;
	pendingFileEdit: PendingFileEditState | null;
	reorderModal: ReorderModalState | null;
	draggedCollectionItem: DraggedCollectionItemState | null;
}

export interface ActiveReorderContext {
	block: BuilderBlock;
	collection: BuilderCollection;
	items: Array<Record<string, unknown>>;
}

export function createEditorControllerState(
	definitions: BuilderDefinition[],
	initialDocument?: BuilderDocument
): EditorControllerState {
	const document = initialDocument ?? createBuilderDocument(definitions);
	const state: EditorControllerState = {
		document,
		draggedBlockId: null,
		copied: false,
		propsErrors: {},
		pendingFileEdit: null,
		reorderModal: null,
		draggedCollectionItem: null
	};

	return state;
}

export function getBuilderDefinition<Definition extends BuilderDefinition>(
	type: string,
	definitions: Definition[]
): Definition {
	const definition = definitions.find((entry) => entry.type === type);
	if (!definition) {
		throw new Error(`Unknown brik type: ${type}`);
	}

	return definition;
}

export function getActiveReorderContext(
	state: EditorControllerState,
	definitions: BuilderDefinition[]
): ActiveReorderContext | null {
	const modal = state.reorderModal;
	if (!modal) {
		return null;
	}

	const block = state.document.blocks.find((entry) => entry.id === modal.blockId);
	if (!block) {
		return null;
	}

	const definition = getBuilderDefinition(block.type, definitions);
	const collection = definition.collections.find((entry) => entry.path === modal.collectionPath);
	if (!collection) {
		return null;
	}

	return {
		block,
		collection,
		items: getCollectionItems(block.props, collection)
	};
}

export function insertBlock(
	state: EditorControllerState,
	definitions: BuilderDefinition[],
	type: string,
	index: number
): BuilderBlock {
	const block = createBlock(type, definitions);
	const at = Math.max(0, Math.min(index, state.document.blocks.length));
	state.document.blocks.splice(at, 0, block);
	return block;
}

export function removeBlock(state: EditorControllerState, blockId: string): void {
	state.document.blocks = state.document.blocks.filter((block) => block.id !== blockId);
	delete state.propsErrors[blockId];
}

export function handleBlockDragStart(
	state: EditorControllerState,
	blockId: string
): void {
	state.draggedBlockId = blockId;
}

export function moveBlock(
	state: EditorControllerState,
	blockId: string,
	direction: -1 | 1
): void {
	const index = state.document.blocks.findIndex((block) => block.id === blockId);
	const nextIndex = index + direction;

	if (index === -1 || nextIndex < 0 || nextIndex >= state.document.blocks.length) {
		return;
	}

	const reordered = [...state.document.blocks];
	const [block] = reordered.splice(index, 1);
	reordered.splice(nextIndex, 0, block);
	state.document.blocks = reordered;
}

export function handleBlockDrop(
	state: EditorControllerState,
	targetBlockId: string
): void {
	if (!state.draggedBlockId || state.draggedBlockId === targetBlockId) {
		state.draggedBlockId = null;
		return;
	}

	const reordered = [...state.document.blocks];
	const draggedIndex = reordered.findIndex((block) => block.id === state.draggedBlockId);
	const targetIndex = reordered.findIndex((block) => block.id === targetBlockId);

	if (draggedIndex === -1 || targetIndex === -1) {
		state.draggedBlockId = null;
		return;
	}

	const [draggedBlock] = reordered.splice(draggedIndex, 1);
	reordered.splice(targetIndex, 0, draggedBlock);
	state.document.blocks = reordered;
	state.draggedBlockId = null;
}

export function syncBlockProps(
	state: EditorControllerState,
	block: BuilderBlock,
	nextProps: Record<string, unknown>
): void {
	block.props = nextProps;
	state.propsErrors[block.id] = null;
}

export function updatePropAtPath(
	state: EditorControllerState,
	block: BuilderBlock,
	path: string,
	value: unknown
): void {
	syncBlockProps(state, block, updatePropsAtPath(block.props, path, value));
}

/**
 * Page-level metadata. `title`/`description` are routed to the top-level
 * document fields; every other field is stored under `document.metadata`.
 */
export function getPageFieldValue(document: BuilderDocument, key: string): unknown {
	if (key === 'title') return document.title;
	if (key === 'description') return document.description;
	return (document.metadata ?? {})[key];
}

export function setPageField(state: EditorControllerState, path: string, value: unknown): void {
	const document = state.document;
	if (path === 'title') {
		document.title = typeof value === 'string' ? value : String(value ?? '');
		return;
	}
	if (path === 'description') {
		document.description = typeof value === 'string' ? value : String(value ?? '');
		return;
	}
	document.metadata = updatePropsAtPath(document.metadata ?? {}, path, value);
}

export function setDocumentLayout(state: EditorControllerState, layout: string | null): void {
	if (layout && layout.trim()) {
		state.document.layout = layout.trim();
	} else {
		delete state.document.layout;
	}
}

export function addPageItem(state: EditorControllerState, collection: BuilderCollection): void {
	state.document.metadata = addCollectionItem(state.document.metadata ?? {}, collection);
}

export function removePageItem(
	state: EditorControllerState,
	collection: BuilderCollection,
	index: number
): void {
	state.document.metadata = removeCollectionItem(state.document.metadata ?? {}, collection, index);
}

export function movePageItem(
	state: EditorControllerState,
	collection: BuilderCollection,
	index: number,
	direction: -1 | 1
): void {
	state.document.metadata = moveCollectionItem(
		state.document.metadata ?? {},
		collection,
		index,
		direction
	);
}

export function queueFileEdit(
	state: EditorControllerState,
	blockId: string,
	path: string
): void {
	state.pendingFileEdit = { blockId, path };
}

export function queuePageFileEdit(state: EditorControllerState, path: string): void {
	state.pendingFileEdit = { blockId: null, path };
}

export function applyFileToPendingEdit(
	state: EditorControllerState,
	dataUrl: string
): BuilderBlock | null {
	const pending = state.pendingFileEdit;
	if (!pending) {
		return null;
	}

	if (pending.blockId === null) {
		setPageField(state, pending.path, dataUrl);
		state.pendingFileEdit = null;
		return null;
	}

	const block = state.document.blocks.find((entry) => entry.id === pending.blockId);
	if (!block) {
		state.pendingFileEdit = null;
		return null;
	}

	syncBlockProps(state, block, updatePropsAtPath(block.props, pending.path, dataUrl));
	state.pendingFileEdit = null;
	return block;
}

export function clearPendingFileEdit(state: EditorControllerState): void {
	state.pendingFileEdit = null;
}

export function setBlockError(
	state: EditorControllerState,
	blockId: string,
	message: string | null
): void {
	state.propsErrors[blockId] = message;
}

export function addItem(
	state: EditorControllerState,
	definitions: BuilderDefinition[],
	block: BuilderBlock,
	collectionPath: string
): void {
	const collection = getCollectionDefinition(definitions, block, collectionPath);
	if (!collection) return;
	syncBlockProps(state, block, addCollectionItem(block.props, collection));
}

export function removeItem(
	state: EditorControllerState,
	definitions: BuilderDefinition[],
	block: BuilderBlock,
	collectionPath: string,
	index: number
): void {
	const collection = getCollectionDefinition(definitions, block, collectionPath);
	if (!collection) return;
	syncBlockProps(state, block, removeCollectionItem(block.props, collection, index));
}

export function moveItem(
	state: EditorControllerState,
	definitions: BuilderDefinition[],
	block: BuilderBlock,
	collectionPath: string,
	index: number,
	direction: -1 | 1
): void {
	const collection = getCollectionDefinition(definitions, block, collectionPath);
	if (!collection) return;
	syncBlockProps(state, block, moveCollectionItem(block.props, collection, index, direction));
}

export function openReorderModal(
	state: EditorControllerState,
	blockId: string,
	collectionPath: string
): void {
	state.reorderModal = { blockId, collectionPath };
}

export function closeReorderModal(state: EditorControllerState): void {
	state.reorderModal = null;
	state.draggedCollectionItem = null;
}

export function handleCollectionItemDragStart(
	state: EditorControllerState,
	blockId: string,
	collectionPath: string,
	index: number
): void {
	state.draggedCollectionItem = { blockId, collectionPath, index };
}

export function handleCollectionItemDrop(
	state: EditorControllerState,
	definitions: BuilderDefinition[],
	targetIndex: number
): void {
	const dragged = state.draggedCollectionItem;
	const context = getActiveReorderContext(state, definitions);

	if (!dragged || !context) {
		state.draggedCollectionItem = null;
		return;
	}

	if (dragged.blockId !== context.block.id || dragged.collectionPath !== context.collection.path) {
		state.draggedCollectionItem = null;
		return;
	}

	syncBlockProps(
		state,
		context.block,
		reorderCollectionItem(context.block.props, context.collection, dragged.index, targetIndex)
	);
	state.draggedCollectionItem = null;
}

function getCollectionDefinition(
	definitions: BuilderDefinition[],
	block: BuilderBlock,
	collectionPath: string
): BuilderCollection | null {
	const definition = getBuilderDefinition(block.type, definitions);
	return definition.collections.find((entry) => entry.path === collectionPath) ?? null;
}
