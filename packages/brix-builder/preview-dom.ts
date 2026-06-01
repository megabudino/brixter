import {
	getCollectionItemImagePath,
	getCollectionItemSummary,
	getCollectionItems,
	type BuilderCollection
} from './core.js';
import { isInteractiveFieldHost } from './preview/interactive-content.js';
import { describeFieldElement, logFieldEditEvent } from './preview/field-edit-debug.js';

export interface ResolvedPreviewBinding<Binding> {
	binding: Binding;
	path: string;
	matchedElement: Element;
}

export interface PreviewOverlay {
	collectionPath: string;
	index: number;
	label: string;
	top: number;
	left: number;
	width: number;
	height: number;
	addTop: number;
	addLeft: number;
	showFileButton: boolean;
	filePath: string | null;
	isLast: boolean;
}

export interface PreviewCollectionOverlay {
	collectionPath: string;
	label: string;
	top: number;
	left: number;
	width: number;
	height: number;
	addTop: number;
	addLeft: number;
}

export function resolvePreviewBinding<Binding extends { selector: string; path: string }>({
	bindings,
	container,
	target
}: {
	bindings: Binding[];
	container: HTMLElement;
	target: EventTarget | null;
}): ResolvedPreviewBinding<Binding> | null {
	if (!isElement(target)) {
		return null;
	}

	for (const binding of bindings) {
		const matchedElement = target.closest(binding.selector);
		if (!isElement(matchedElement) || !container.contains(matchedElement)) {
			continue;
		}

		const path = materializeBindingPath(binding.path, container, binding.selector, matchedElement);
		if (!path) {
			continue;
		}

		return { binding, path, matchedElement };
	}

	return null;
}

export function resolvePreviewBindingAtPoint<
	Binding extends { selector: string; path: string }
>({
	bindings,
	container,
	target,
	clientX,
	clientY
}: {
	bindings: Binding[];
	container: HTMLElement;
	target: EventTarget | null;
	clientX?: number;
	clientY?: number;
}): ResolvedPreviewBinding<Binding> | null {
	const direct = resolvePreviewBinding({ bindings, container, target });
	if (direct) {
		logFieldEditEvent('resolve-binding', 'direct hit', {
			path: direct.path,
			...describeFieldElement(direct.matchedElement)
		});
		return direct;
	}

	if (clientX == null || clientY == null) {
		logFieldEditEvent('resolve-binding', 'miss — no coords for point fallback', {
			target: describeFieldElement(target instanceof Element ? target : null)
		});
		return null;
	}

	const pointCandidates: Record<string, unknown>[] = [];

	for (const field of container.querySelectorAll<HTMLElement>('[data-builder-field]')) {
		if (!isInteractiveFieldHost(field)) {
			continue;
		}

		const rect = field.getBoundingClientRect();
		const inside =
			clientX >= rect.left &&
			clientX <= rect.right &&
			clientY >= rect.top &&
			clientY <= rect.bottom;

		pointCandidates.push({
			inside,
			...describeFieldElement(field)
		});

		if (!inside) {
			continue;
		}

		for (const binding of bindings) {
			if (!field.matches(binding.selector)) {
				continue;
			}

			const path = materializeBindingPath(binding.path, container, binding.selector, field);
			if (!path) {
				continue;
			}

			logFieldEditEvent('resolve-binding', 'point hit', {
				path,
				clientX,
				clientY,
				...describeFieldElement(field)
			});

			return { binding, path, matchedElement: field };
		}
	}

	logFieldEditEvent('resolve-binding', 'miss', {
		clientX,
		clientY,
		target: describeFieldElement(target instanceof Element ? target : null),
		pointCandidates
	});

	return null;
}

export function getCollectionPreviewElements(
	container: HTMLElement,
	collection: { previewSelector?: string }
): Element[] {
	if (!collection.previewSelector) {
		return [];
	}

	return Array.from(container.querySelectorAll(collection.previewSelector));
}

export function attachPreviewContainer(
	node: HTMLElement,
	params: {
		block: { id: string; props: Record<string, unknown> };
		definition: {
			collections: BuilderCollection[];
		};
		onOverlaysChange: (blockId: string, overlays: PreviewOverlay[]) => void;
		onCollectionOverlaysChange: (blockId: string, overlays: PreviewCollectionOverlay[]) => void;
	}
): {
	update: (nextParams: typeof params) => void;
	destroy: () => void;
} {
	let currentParams = params;
	const resizeObserver = new ResizeObserver(() => {
		void refresh();
	});
	const mutationObserver = new MutationObserver(() => {
		void refresh();
	});

	resizeObserver.observe(node);
	mutationObserver.observe(node, { childList: true, subtree: true, attributes: true });
	void refresh();

	async function refresh(): Promise<void> {
		await Promise.resolve();

		const overlays: PreviewOverlay[] = [];
		const collectionOverlays: PreviewCollectionOverlay[] = [];

		for (const collection of currentParams.definition.collections) {
			const elements = getCollectionPreviewElements(node, collection);
			const items = getCollectionItems(currentParams.block.props, collection);
			const containerRect = node.getBoundingClientRect();

			if (elements.length > 0) {
				const rects = elements.map((element) => (element as HTMLElement).getBoundingClientRect());
				const top = Math.min(...rects.map((rect) => rect.top));
				const left = Math.min(...rects.map((rect) => rect.left));
				const right = Math.max(...rects.map((rect) => rect.right));
				const bottom = Math.max(...rects.map((rect) => rect.bottom));

				collectionOverlays.push({
					collectionPath: collection.path,
					label: collection.label,
					top: Math.max(8, top - containerRect.top),
					left: Math.max(8, left - containerRect.left),
					width: Math.max(120, right - left),
					height: Math.max(24, bottom - top),
					addTop: Math.max(8, bottom - containerRect.top + 8),
					addLeft: Math.max(8, left - containerRect.left + (right - left) / 2)
				});
			}

			elements.forEach((element, index) => {
				const rect = (element as HTMLElement).getBoundingClientRect();
				const filePath = getCollectionItemImagePath(collection, index);

				overlays.push({
					collectionPath: collection.path,
					index,
					label: getCollectionItemSummary(items[index] ?? {}, collection, index),
					top: Math.max(8, rect.top - containerRect.top - 36),
					left: Math.max(8, rect.left - containerRect.left),
					width: Math.max(120, rect.width),
					height: rect.height,
					addTop: Math.max(8, rect.bottom - containerRect.top + 8),
					addLeft: Math.max(8, rect.left - containerRect.left + rect.width / 2),
					showFileButton: Boolean(filePath),
					filePath,
					isLast: index === elements.length - 1
				});
			});
		}

		currentParams.onOverlaysChange(currentParams.block.id, overlays);
		currentParams.onCollectionOverlaysChange(currentParams.block.id, collectionOverlays);
	}

	return {
		update(nextParams) {
			currentParams = nextParams;
			void refresh();
		},
		destroy() {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
			currentParams.onOverlaysChange(currentParams.block.id, []);
			currentParams.onCollectionOverlaysChange(currentParams.block.id, []);
		}
	};
}

export function materializeFieldPath(
	rawPath: string,
	blockRoot: HTMLElement,
	element: HTMLElement
): string | null {
	if (!rawPath.includes('[]')) {
		return rawPath;
	}

	const match = rawPath.match(/^([^[\]]+)\[\](.*)$/);
	if (!match) {
		return rawPath.replace('[]', '[0]');
	}

	const collectionName = match[1];
	const rest = match[2] ?? '';
	const collectionItem = element.closest(`[data-builder-collection-item="${collectionName}"]`);
	if (!isElement(collectionItem) || !blockRoot.contains(collectionItem)) {
		return null;
	}

	const selector = `[data-builder-collection-item="${collectionName}"]`;
	const items = Array.from(blockRoot.querySelectorAll(selector));
	const index = items.indexOf(collectionItem);
	if (index === -1) {
		return null;
	}

	return `${collectionName}[${index}]${rest}`;
}

function materializeBindingPath(
	path: string,
	container: HTMLElement,
	selector: string,
	matchedElement: Element
): string | null {
	if (!path.includes('[]')) {
		return path;
	}

	const elements = Array.from(container.querySelectorAll(selector));
	const index = elements.indexOf(matchedElement);

	if (index === -1) {
		return null;
	}

	return path.replace('[]', `[${index}]`);
}

function isElement(value: unknown): value is Element {
	return typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
}
