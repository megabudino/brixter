import { mount, unmount } from 'svelte';
import PreviewTextEditor from '../editor/PreviewTextEditor.svelte';
import RichTextEditor from '../editor/RichTextEditor.svelte';
import PreviewImageEditor from '../editor/PreviewImageEditor.svelte';
import PreviewIconEditor from '../editor/PreviewIconEditor.svelte';
import type { BuilderRenderDefinition } from '../editor/contracts.js';
import {
	createRichTextValue,
	getValueAtPath,
	isRichTextValue,
	getFallbackText,
	type BuilderBlock,
	type BuilderRichTextValue,
	type BuilderField,
	type BuilderFields
} from '../core.js';
import { materializeFieldPath } from '../preview-dom.js';
import {
	isInteractiveFieldHost,
	neutralizeInteractiveElement,
} from './interactive-content.js';
import { describeFieldElement, logFieldEditEvent } from './field-edit-debug.js';

let globalSuppressBlurClose = false;

type FieldKind = 'richtext' | 'text' | 'image' | 'icon' | 'pending';

interface ClickCoords {
	left: number;
	top: number;
}

interface MountedField {
	path: string;
	kind: FieldKind;
	element: HTMLElement;
	instance: Record<string, unknown> | null;
	cleanup: (() => void) | null;
}

function clearPreviewFieldChrome(element: HTMLElement): void {
	element.removeAttribute('data-brixter-placeholder');
	element.removeAttribute('data-brixter-placeholder-active');
	element.removeAttribute('data-brixter-icon-empty');
	if (element.dataset.builderPreviewMinWidth === 'true') {
		element.style.removeProperty('min-width');
		delete element.dataset.builderPreviewMinWidth;
	}
}

function restoreNeutralizedInteractiveElement(element: HTMLElement): void {
	if (element.dataset.builderPreviewNeutralized !== 'true') {
		return;
	}

	for (const attribute of ['href', 'target', 'download'] as const) {
		const datasetKey = `builderPreview${attribute[0].toUpperCase()}${attribute.slice(1)}`;
		const value = element.dataset[datasetKey];
		if (value == null) {
			continue;
		}

		element.setAttribute(attribute, value);
		delete element.dataset[datasetKey];
	}

	delete element.dataset.builderPreviewNeutralized;
}

export function attachPreviewEditableFields(
	node: HTMLElement,
	params: {
		block: BuilderBlock;
		definition: BuilderRenderDefinition;
		previewProps: Record<string, unknown>;
		active: boolean;
		onUpdateRichText: (path: string, value: BuilderRichTextValue) => void;
		onUpdateText: (path: string, value: string) => void;
		onQueueFileEdit: (path: string) => void;
		onCloseFieldEdit: () => void;
		onFocusField: (path: string, caretOffset: number | null) => void;
		focusPath?: string | null;
		caretOffset?: number | null;
	}
): {
	update: (nextParams: typeof params) => void;
	destroy: () => void;
} {
	let currentParams = params;
	const mounts = new Map<HTMLElement, MountedField>();
	const mutationObserver = new MutationObserver((mutations) => {
		if (mutations.every((mutation) => isEditorInternalMutation(mutation.target))) {
			return;
		}

		void refreshSoon();
	});
	let refreshQueued = false;
	let suppressBlurClose = false;

	mutationObserver.observe(node, { childList: true, subtree: true, attributes: true });
	refreshNow();

	function refreshSoon(): void {
		if (refreshQueued) {
			return;
		}

		refreshQueued = true;
		requestAnimationFrame(() => {
			refreshQueued = false;
			refreshNow();
		});
	}

	function refreshNow(): void {
		node.toggleAttribute('data-brixter-editing', currentParams.active);

		if (!currentParams.active) {
			teardownAll();
		}

		const blockRoot = getBlockRoot(node);
		const fields = Array.from(node.querySelectorAll<HTMLElement>('[data-brixter-field]'));
		const liveFields = new Set(fields);
		const focusPath = currentParams.focusPath ?? null;

		for (const [element, state] of Array.from(mounts.entries())) {
			if (!liveFields.has(element) || !node.contains(element)) {
				teardownField(element);
				continue;
			}

			if (state.instance && state.kind !== 'image' && state.kind !== 'icon' && (state.path !== focusPath || !hasEditorHost(element))) {
				teardownField(element);
			}

			if (state.instance && state.kind === 'icon') {
				const isFocused = state.path === focusPath;
				if (!isFocused && typeof (state.instance as any).close === 'function') {
					(state.instance as any).close();
				}
			}
		}

		for (const element of fields) {
			const rawPath = element.getAttribute('data-brixter-field');
			if (!rawPath) {
				continue;
			}

			const path = resolveFieldPath(element, blockRoot);
			if (!path) {
				continue;
			}

			if (!currentParams.active) {
				if (isInteractiveFieldHost(element)) {
					restoreNeutralizedInteractiveElement(element);
				}
				clearPreviewFieldChrome(element);
				continue;
			}

			if (isInteractiveFieldHost(element)) {
				neutralizeInteractiveElement(element);
			}

			const fieldDef = getFieldByRawPath(currentParams.definition.fields, rawPath);
			const defaultValue = fieldDef?.default ?? getValueAtPath(currentParams.definition.defaults, path);
			let defaultString = resolveDefaultText(defaultValue);

			if (!defaultString) {
				defaultString = element.getAttribute('data-brixter-default') || 
				                (fieldDef ? getFallbackText(rawPath.split('.').at(-1) || '') : '');
			}

			let plainDefaultString = defaultString.replace(/<[^>]*>/g, '').trim();
			if (resolveFieldKind(element) === 'icon') {
				plainDefaultString = '';
			}
			if (plainDefaultString) {
				element.setAttribute('data-brixter-placeholder', plainDefaultString);
			} else {
				element.removeAttribute('data-brixter-placeholder');
			}

			const rawValue = getValueAtPath(currentParams.previewProps, path);
			const isEmpty = rawValue === undefined || rawValue === '' || (isRichTextValue(rawValue) && !rawValue.html.trim());
			const isEditing =
				path === focusPath || element.dataset.builderFieldEnhanced === 'true';

			if (isEditing) {
				element.removeAttribute('data-brixter-placeholder-active');
			} else {
				element.toggleAttribute('data-brixter-placeholder-active', isEmpty);
			}

			if (resolveFieldKind(element) === 'icon' && isEmpty) {
				element.setAttribute('data-brixter-icon-empty', 'true');
				const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle" style="width: 100%; height: 100%; opacity: 0.4; stroke-dasharray: 4 4;"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`;
				if (element.innerHTML.trim() !== placeholderSvg) {
					element.innerHTML = placeholderSvg;
				}
			} else if (resolveFieldKind(element) === 'icon') {
				element.removeAttribute('data-brixter-icon-empty');
			}

			if (
				isInteractiveFieldHost(element) &&
				isEmpty &&
				resolveFieldKind(element) === 'text'
			) {
				syncInteractiveHostMinWidth(
					element,
					plainDefaultString || element.getAttribute('data-brixter-placeholder') || ''
				);
			} else if (element.dataset.builderPreviewMinWidth === 'true') {
				element.style.removeProperty('min-width');
				delete element.dataset.builderPreviewMinWidth;
			}


			if (!currentParams.active) {
				continue;
			}

			const kind = resolveFieldKind(element);
			const existing = mounts.get(element);

			if (path === focusPath || kind === 'image' || kind === 'icon') {
				if (!existing?.instance || !hasEditorHost(element)) {
					if (existing) {
						teardownField(element);
					}
					setupField(element, blockRoot);
				}
				continue;
			}

			if (existing?.instance) {
				teardownField(element);
			}

			if (!mounts.has(element)) {
				setupPendingField(element, path);
			}
		}
	}

	function hasEditorHost(element: HTMLElement): boolean {
		const kind = resolveFieldKind(element);
		if (kind === 'image' || kind === 'icon') {
			return Boolean(element.nextElementSibling?.classList.contains('builder-preview-field-editor'));
		}
		return Boolean(element.querySelector('.builder-preview-field-editor'));
	}

	function resolveFieldPath(element: HTMLElement, blockRoot: HTMLElement): string | null {
		const rawPath = element.getAttribute('data-brixter-field');
		if (!rawPath) {
			return null;
		}

		return materializeFieldPath(rawPath, blockRoot, element);
	}

	function setupPendingField(element: HTMLElement, path: string): void {
		const kind = resolveFieldKind(element);
		element.dataset.builderFieldEnhanced = 'pending';
		element.style.cursor = (kind === 'image' || kind === 'icon') ? 'pointer' : 'text';

		const handleClick = (event: Event) => {
			logFieldEditEvent('pending-mousedown', 'activate requested', {
				path,
				eventType: event.type,
				...describeFieldElement(element),
				target: describeFieldElement(event.target instanceof Element ? event.target : null)
			});
			event.stopPropagation();
			activateField(element, path, event);
		};

		element.addEventListener('mousedown', handleClick, true);

		mounts.set(element, {
			path,
			kind: 'pending',
			element,
			instance: null,
			cleanup: () => {
				element.removeEventListener('mousedown', handleClick, true);
				element.style.removeProperty('cursor');
				delete element.dataset.builderFieldEnhanced;
			}
		});
	}

	function activateField(element: HTMLElement, path: string, event?: Event): void {
		logFieldEditEvent('activate', 'start', {
			path,
			caretOffset: event ? getClickCaretOffset(element, event) : null,
			coords: getClickCoords(event),
			...describeFieldElement(element)
		});
		suppressBlurClose = true;
		globalSuppressBlurClose = true;

		const clickCoords = getClickCoords(event);
		const caretOffset = event ? getClickCaretOffset(element, event) : null;

		currentParams = { ...currentParams, focusPath: path, caretOffset };
		currentParams.onFocusField(path, caretOffset);

		const existing = mounts.get(element);
		if (existing?.instance && existing.path === path) {
			focusMountedField(path, clickCoords, caretOffset);
			releaseBlurSuppression();
			return;
		}

		for (const [otherElement, state] of Array.from(mounts.entries())) {
			if (otherElement !== element && state.instance) {
				teardownField(otherElement);
			}
		}

		if (existing) {
			teardownField(element, { restorePending: false });
		}

		setupField(element, getBlockRoot(node), clickCoords);
		releaseBlurSuppression();
	}

	function releaseBlurSuppression(): void {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				suppressBlurClose = false;
				globalSuppressBlurClose = false;
			});
		});
	}

	function getPreviewRoot(doc: Document): HTMLElement {
		return (doc.getElementById('builder-preview-root') as HTMLElement | null) ?? doc.body;
	}

	function scheduleBlurClose(): void {
		setTimeout(() => {
			if (suppressBlurClose || globalSuppressBlurClose) {
				return;
			}

			const doc = node.ownerDocument;
			const active = doc.activeElement;
			const previewRoot = getPreviewRoot(doc);

			if (isEditableElement(active) && previewRoot.contains(active)) {
				return;
			}

			currentParams.onCloseFieldEdit();
		}, 0);
	}

	function isEditableElement(element: Element | null): boolean {
		if (!element) {
			return false;
		}

		return Boolean(
			element.closest(
				'.builder-preview-field-editor, .ProseMirror, .builder-preview-text-editor, [data-brixter-field-enhanced="pending"]'
			)
		);
	}

	function setupField(
		element: HTMLElement,
		blockRoot: HTMLElement,
		clickCoords: ClickCoords | null = null
	): void {
		const path = resolveFieldPath(element, blockRoot);
		if (!path) {
			return;
		}

		const kind = resolveFieldKind(element);
		const useHostInlineTextEditor = kind === 'text' && isInteractiveFieldHost(element);
		const multiline = kind === 'text' && !useHostInlineTextEditor && inferMultiline(element);

		element.removeAttribute('data-brixter-placeholder-active');
		element.dataset.builderFieldEnhanced = 'true';
		element.style.cursor = (kind === 'image' || kind === 'icon') ? 'pointer' : 'text';

		const placeholder = element.getAttribute('data-brixter-placeholder') || '';
		const hostWidth = element.offsetWidth;
		const placeholderWidth = measurePlaceholderWidth(element, placeholder);

		if (useHostInlineTextEditor) {
			element.style.setProperty(
				'--builder-preview-field-text-color',
				resolveInteractiveFieldTextColor(element)
			);
		}

		const fieldStyle = captureFieldEditorStyle(element, {
			includeMinHeight: kind !== 'text' || multiline || !isInteractiveFieldHost(element),
			omitColor: useHostInlineTextEditor,
			forceLineHeightMin: useHostInlineTextEditor
		});

		if (!useHostInlineTextEditor && fieldStyle.includes('color:')) {
			const colorMatch = fieldStyle.match(/color:([^;]+)/);
			if (colorMatch?.[1]) {
				element.style.setProperty('--builder-preview-field-text-color', colorMatch[1].trim());
			}
		}

		if (useHostInlineTextEditor) {
			element.style.minWidth = `${Math.max(hostWidth, placeholderWidth)}px`;
			element.dataset.builderPreviewMinWidth = 'true';
		}

		const mountHost = element.ownerDocument.createElement('div');
		mountHost.className = 'builder-preview-field-editor';
		mountHost.style.cursor = kind === 'image' || kind === 'icon' ? 'default' : 'text';

		if (kind === 'image' || kind === 'icon') {
			element.parentNode?.insertBefore(mountHost, element.nextSibling);
		} else {
			element.replaceChildren(mountHost);
		}

		const value = getValueAtPath(currentParams.previewProps, path);
		const shouldFocus = currentParams.focusPath === path;

		let instance: Record<string, unknown>;

		if (kind === 'icon') {
			instance = mount(PreviewIconEditor, {
				target: mountHost,
				props: {
					element: element,
					onPick: () => currentParams.onQueueFileEdit(path),
					onRemove: () => {
						currentParams.onUpdateText(path, '');
						currentParams.onCloseFieldEdit();
					},
					onFocus: () => {
						currentParams.onFocusField(path, null);
					},
					onBlur: () => {
						if (currentParams.focusPath === path) {
							currentParams.onCloseFieldEdit();
						}
					}
				}
			}) as Record<string, unknown>;
		} else if (kind === 'image') {
			instance = mount(PreviewImageEditor, {
				target: mountHost,
				props: {
					element: element as HTMLImageElement,
					onPick: () => currentParams.onQueueFileEdit(path),
					onRemove: () => {
						currentParams.onUpdateText(path, '');
						currentParams.onCloseFieldEdit();
					},
					onBlur: () => {
						if (currentParams.focusPath === path) {
							currentParams.onCloseFieldEdit();
						}
					}
				}
			}) as Record<string, unknown>;
		} else if (kind === 'richtext') {
			const richValue = coerceRichTextValue(value, element);
			instance = mount(RichTextEditor, {
				target: mountHost,
				props: {
					value: richValue,
					placeholder,
					mode: richValue.mode,
					chrome: 'inline',
					autofocus: shouldFocus,
					initialCaretOffset: shouldFocus ? (currentParams.caretOffset ?? null) : null,
					initialClickCoords: shouldFocus ? clickCoords : null,
					editorStyle: fieldStyle,
					onChange: (nextValue: BuilderRichTextValue) =>
						currentParams.onUpdateRichText(path, nextValue),
					onBlur: () => scheduleBlurClose()
				}
			}) as Record<string, unknown>;
		} else if (useHostInlineTextEditor) {
			const textValue = asPlainText(value);
			const richValue = createRichTextValue('inline', textValue);
			instance = mount(RichTextEditor, {
				target: mountHost,
				props: {
					value: richValue,
					mode: 'inline',
					placeholder,
					chrome: 'inline',
					plainTextOnly: true,
					hostInline: true,
					autofocus: shouldFocus,
					initialCaretOffset: shouldFocus ? (currentParams.caretOffset ?? null) : null,
					initialClickCoords: shouldFocus ? clickCoords : null,
					editorStyle: fieldStyle,
					onChange: (nextValue: BuilderRichTextValue) => {
						const plain = plainTextFromInlineRichHtml(
							nextValue.html,
							element.ownerDocument
						);
						if (plain.trim()) {
							element.removeAttribute('data-brixter-placeholder-active');
						}
						currentParams.onUpdateText(path, plain);
					},
					onBlur: () => scheduleBlurClose()
				}
			}) as Record<string, unknown>;
		} else {
			const textValue = asPlainText(value);
			instance = mount(PreviewTextEditor, {
				target: mountHost,
				props: {
					value: textValue,
					placeholder,
					multiline,
					inline: false,
					textStyle: fieldStyle,
					autofocus: shouldFocus,
					initialCaretOffset: shouldFocus ? (currentParams.caretOffset ?? null) : null,
					initialClickCoords: shouldFocus ? clickCoords : null,
					onChange: (nextValue: string) => {
						if (nextValue.trim()) {
							element.removeAttribute('data-brixter-placeholder-active');
						}
						currentParams.onUpdateText(path, nextValue);
					},
					onBlur: () => scheduleBlurClose()
				}
			}) as Record<string, unknown>;
		}

		mounts.set(element, {
			path,
			kind,
			element,
			instance,
			cleanup: () => {
				element.style.removeProperty('cursor');
				element.style.removeProperty('--builder-preview-field-text-color');
				if (element.dataset.builderPreviewMinWidth === 'true') {
					element.style.removeProperty('min-width');
					delete element.dataset.builderPreviewMinWidth;
				}
			}
		});
	}

	function focusMountedField(
		path: string,
		clickCoords: ClickCoords | null,
		caretOffset: number | null
	): void {
		for (const state of mounts.values()) {
			if (state.path !== path || !state.instance) {
				continue;
			}

			if (state.kind === 'text') {
				const proseMirror = state.element.querySelector('.ProseMirror') as HTMLElement | null;
				const input = state.element.querySelector('.builder-preview-text-editor') as
					| HTMLElement
					| null;
				const editorEl = proseMirror ?? input;
				if (!editorEl) {
					return;
				}

				editorEl.focus();

				if (clickCoords && proseMirror) {
					return;
				}

				if (clickCoords) {
					const doc = editorEl.ownerDocument;
					const range =
						doc.caretRangeFromPoint?.(clickCoords.left, clickCoords.top) ??
						(() => {
							const pos = doc.caretPositionFromPoint?.(clickCoords.left, clickCoords.top);
							if (!pos) {
								return null;
							}

							const nextRange = doc.createRange();
							nextRange.setStart(pos.offsetNode, pos.offset);
							nextRange.collapse(true);
							return nextRange;
						})();

					if (range && editorEl.contains(range.startContainer)) {
						const selection = doc.getSelection();
						selection?.removeAllRanges();
						selection?.addRange(range);
						return;
					}
				}

				if (proseMirror || caretOffset == null || !input) {
					return;
				}

				if (caretOffset != null) {
					const doc = input.ownerDocument;
					const selection = doc.getSelection();
					if (!selection) {
						return;
					}

					const walker = doc.createTreeWalker(input, NodeFilter.SHOW_TEXT);
					let remaining = caretOffset;

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
				}
				return;
			}

			if (state.kind === 'richtext') {
				const proseMirror = state.element.querySelector('.ProseMirror') as HTMLElement | null;
				if (!proseMirror) {
					return;
				}

				proseMirror.focus();

				if (clickCoords) {
					const doc = proseMirror.ownerDocument;
					const range =
						doc.caretRangeFromPoint?.(clickCoords.left, clickCoords.top) ??
						(() => {
							const pos = doc.caretPositionFromPoint?.(clickCoords.left, clickCoords.top);
							if (!pos) {
								return null;
							}

							const nextRange = doc.createRange();
							nextRange.setStart(pos.offsetNode, pos.offset);
							nextRange.collapse(true);
							return nextRange;
						})();

					if (range && proseMirror.contains(range.startContainer)) {
						const selection = doc.getSelection();
						selection?.removeAllRanges();
						selection?.addRange(range);
					}
				}
				return;
			}
		}
	}

	function teardownField(
		element: HTMLElement,
		options: { restorePending?: boolean } = {}
	): void {
		const state = mounts.get(element);
		if (!state) {
			return;
		}

		if (state.instance) {
			void unmount(state.instance);
			if (state.kind === 'image' || state.kind === 'icon') {
				const nextSibling = state.element.nextElementSibling;
				if (nextSibling?.classList.contains('builder-preview-field-editor')) {
					nextSibling.remove();
				}
			}
		}

		state.cleanup?.();

		if (state.instance) {
			if (state.kind !== 'image' && state.kind !== 'icon' && state.kind !== 'pending') {
				const value = getValueAtPath(currentParams.previewProps, state.path);
				const defaultValue = element.getAttribute('data-brixter-placeholder') || '';
				restoreElementContent(state.element, value, state.kind, defaultValue);
			}
		}

		delete state.element.dataset.builderFieldEnhanced;
		mounts.delete(element);

		if (options.restorePending === false || !currentParams.active) {
			return;
		}

		const blockRoot = getBlockRoot(node);
		const path = resolveFieldPath(element, blockRoot);
		const focusPath = currentParams.focusPath ?? null;
		if (!path || path === focusPath) {
			return;
		}

		setupPendingField(element, path);
	}

	function teardownAll(): void {
		for (const element of Array.from(mounts.keys())) {
			teardownField(element, { restorePending: false });
		}
	}

	function editingContextChanged(nextParams: typeof params): boolean {
		return (
			currentParams.active !== nextParams.active ||
			currentParams.block.id !== nextParams.block.id ||
			currentParams.definition !== nextParams.definition ||
			currentParams.focusPath !== nextParams.focusPath ||
			currentParams.caretOffset !== nextParams.caretOffset
		);
	}

	return {
		update(nextParams) {
			const shouldRefresh = editingContextChanged(nextParams);
			currentParams = nextParams;

			if (!shouldRefresh) {
				return;
			}

			refreshNow();
		},
		destroy() {
			mutationObserver.disconnect();
			teardownAll();
			node.removeAttribute('data-brixter-editing');
		}
	};
}

function getBlockRoot(node: HTMLElement): HTMLElement {
	return (node.closest('[data-brixter-preview-block]') as HTMLElement | null) ?? node;
}

function resolveFieldKind(element: HTMLElement): FieldKind {
	const builderKind = element.getAttribute('data-brixter-kind');

	if (builderKind === 'icon') {
		return 'icon';
	}

	if (builderKind === 'richtext-inline' || builderKind === 'richtext-block') {
		return 'richtext';
	}

	if (element.tagName.toLowerCase() === 'img') {
		return 'image';
	}

	return 'text';
}

function coerceRichTextValue(value: unknown, element: HTMLElement): BuilderRichTextValue {
	if (isRichTextValue(value)) {
		return value;
	}

	const builderKind = element.getAttribute('data-brixter-kind');
	const mode = builderKind === 'richtext-block' ? 'block' : 'inline';
	return createRichTextValue(mode, asPlainText(value));
}

function asPlainText(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (isRichTextValue(value)) {
		return value.html;
	}

	return value == null ? '' : String(value);
}

function inferMultiline(element: HTMLElement): boolean {
	if (isInteractiveFieldHost(element)) {
		return false;
	}

	const tagName = element.tagName.toLowerCase();
	if (tagName === 'textarea' || tagName === 'p') {
		return true;
	}

	const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
	if (!computed) {
		return false;
	}

	const lineHeight = Number.parseFloat(computed.lineHeight);
	const height = element.getBoundingClientRect().height;
	return height > (Number.isFinite(lineHeight) ? lineHeight * 1.5 : 32);
}

function plainTextFromInlineRichHtml(html: string, doc: Document): string {
	const trimmed = html.trim();
	if (!trimmed || trimmed === '<p></p>') {
		return '';
	}

	const paragraphMatch = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
	const inner = paragraphMatch ? paragraphMatch[1] : trimmed;
	const container = doc.createElement('div');
	container.innerHTML = inner;
	return (container.textContent ?? '').replace(/\u00a0/g, ' ');
}

function measurePlaceholderWidth(element: HTMLElement, placeholder: string): number {
	const text = placeholder.trim();
	if (!text) {
		return 0;
	}

	const doc = element.ownerDocument;
	const view = doc.defaultView;
	if (!view) {
		return 0;
	}

	const probe = doc.createElement('span');
	probe.textContent = text;
	probe.style.visibility = 'hidden';
	probe.style.position = 'absolute';
	probe.style.whiteSpace = 'nowrap';
	probe.style.pointerEvents = 'none';
	const computed = view.getComputedStyle(element);
	probe.style.font = computed.font;
	probe.style.letterSpacing = computed.letterSpacing;
	probe.style.textTransform = computed.textTransform;
	doc.body.appendChild(probe);
	const width = probe.offsetWidth;
	probe.remove();
	return width;
}

function syncInteractiveHostMinWidth(element: HTMLElement, placeholder: string): void {
	const placeholderWidth = measurePlaceholderWidth(element, placeholder);
	const hostWidth = element.offsetWidth;
	const minWidth = Math.max(hostWidth, placeholderWidth);

	if (minWidth > 0) {
		element.style.minWidth = `${minWidth}px`;
		element.dataset.builderPreviewMinWidth = 'true';
		return;
	}

	if (element.dataset.builderPreviewMinWidth === 'true') {
		element.style.removeProperty('min-width');
		delete element.dataset.builderPreviewMinWidth;
	}
}

function resolveInteractiveFieldTextColor(element: HTMLElement): string {
	const doc = element.ownerDocument;
	const view = doc.defaultView;
	if (!view) {
		return 'currentColor';
	}

	const clone = doc.createElement(element.tagName.toLowerCase());
	for (const className of element.classList) {
		clone.classList.add(className);
	}
	clone.textContent = '\u00a0';
	clone.style.visibility = 'hidden';
	clone.style.position = 'absolute';
	clone.style.pointerEvents = 'none';
	doc.body.appendChild(clone);
	const color = view.getComputedStyle(clone).color;
	clone.remove();

	return isPlaceholderTone(color) ? 'currentColor' : color;
}

function restoreElementContent(
	element: HTMLElement,
	value: unknown,
	kind: Exclude<FieldKind, 'pending'>,
	defaultValue = ''
): void {
	if (kind === 'richtext') {
		const html = isRichTextValue(value) ? value.html : asPlainText(value);
		element.innerHTML = html.trim() ? html : (defaultValue ? `<p>${defaultValue}</p>` : '');
		return;
	}

	if (kind === 'text') {
		const text = asPlainText(value);
		if (!text.trim() && isInteractiveFieldHost(element)) {
			element.textContent = '';
			return;
		}

		element.textContent = text.trim() ? text : defaultValue;
		return;
	}

	if (kind === 'image' && typeof value === 'string') {
		(element as HTMLImageElement).src = value;
	}
}

function captureFieldEditorStyle(
	element: HTMLElement,
	options: { includeMinHeight?: boolean; omitColor?: boolean; forceLineHeightMin?: boolean } = {}
): string {
	const includeMinHeight = options.includeMinHeight ?? true;
	const omitColor = options.omitColor ?? false;
	const forceLineHeightMin = options.forceLineHeightMin ?? false;
	const view = element.ownerDocument.defaultView;
	if (!view) {
		return '';
	}

	const computed = view.getComputedStyle(element);
	const height = element.offsetHeight;
	const color = omitColor ? null : resolveFieldEditorColor(element, computed.color);

	const styles = [
		`font-family:${computed.fontFamily}`,
		`font-size:${computed.fontSize}`,
		`font-weight:${computed.fontWeight}`,
		`font-style:${computed.fontStyle}`,
		`line-height:${computed.lineHeight}`,
		`letter-spacing:${computed.letterSpacing}`,
		`text-transform:${computed.textTransform}`,
		`text-align:${computed.textAlign}`,
		color ? `color:${color}` : '',
		`font-variant:${computed.fontVariant}`,
		`font-stretch:${computed.fontStretch}`,
		`word-spacing:${computed.wordSpacing}`,
		`white-space:${computed.whiteSpace}`,
		height > 0 && includeMinHeight ? `min-height:${height}px` : '',
		forceLineHeightMin ? `min-height:${computed.lineHeight}` : ''
	];

	return styles.filter(Boolean).join(';');
}

function resolveFieldEditorColor(element: HTMLElement, color: string): string {
	if (!isInteractiveFieldHost(element) || !isPlaceholderTone(color)) {
		return color;
	}

	const hadPlaceholder = element.hasAttribute('data-brixter-placeholder-active');
	element.removeAttribute('data-brixter-placeholder-active');

	let resolved = element.ownerDocument.defaultView?.getComputedStyle(element).color ?? color;

	if (isPlaceholderTone(resolved)) {
		const probe = element.ownerDocument.createTextNode('\u00a0');
		element.appendChild(probe);
		resolved = element.ownerDocument.defaultView?.getComputedStyle(element).color ?? resolved;
		probe.remove();
	}

	if (hadPlaceholder) {
		element.setAttribute('data-brixter-placeholder-active', '');
	}

	return isPlaceholderTone(resolved) ? color : resolved;
}

function isPlaceholderTone(color: string): boolean {
	const normalized = color.replace(/\s+/g, '').toLowerCase();
	return (
		normalized === 'rgb(156,163,175)' ||
		normalized === '#9ca3af' ||
		normalized === 'rgb(156,163,175)'
	);
}

function getClickCoords(event?: Event): ClickCoords | null {
	if (!event || !(event instanceof MouseEvent)) {
		return null;
	}

	return { left: event.clientX, top: event.clientY };
}

function isEditorInternalMutation(target: Node): boolean {
	if (!(target instanceof Element)) {
		return target.parentElement != null && isEditorInternalMutation(target.parentElement);
	}

	return Boolean(
		target.closest('.builder-preview-field-editor, .ProseMirror, .builder-preview-text-editor')
	);
}

function getClickCaretOffset(element: HTMLElement, event: Event): number | null {
	if (!(event instanceof MouseEvent)) {
		return null;
	}

	const doc = element.ownerDocument;
	const range =
		doc.caretRangeFromPoint?.(event.clientX, event.clientY) ??
		(() => {
			const pos = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
			if (!pos) {
				return null;
			}

			const nextRange = doc.createRange();
			nextRange.setStart(pos.offsetNode, pos.offset);
			nextRange.collapse(true);
			return nextRange;
		})();

	if (!range || !element.contains(range.startContainer)) {
		return null;
	}

	const preRange = doc.createRange();
	preRange.selectNodeContents(element);
	preRange.setEnd(range.startContainer, range.startOffset);
	return preRange.toString().length;
}

function getFieldByRawPath(fields: BuilderFields, rawPath: string): BuilderField | null {
	const segments = rawPath.split('.');
	let currentFields: BuilderFields | undefined = fields;
	let currentField: BuilderField | null = null;

	for (const segment of segments) {
		if (!currentFields) {
			return null;
		}

		const isArray = segment.endsWith('[]');
		const name = isArray ? segment.slice(0, -2) : segment;
		const field: BuilderField | undefined = currentFields[name];

		if (!field) {
			return null;
		}

		currentField = field;

		if (isArray && field.item?.fields) {
			currentFields = field.item.fields;
		} else if (field.fields) {
			currentFields = field.fields;
		} else {
			currentFields = undefined;
		}
	}

	return currentField;
}

function resolveDefaultText(defaultValue: unknown): string {
	if (isRichTextValue(defaultValue)) {
		return defaultValue.html.trim();
	}
	if (typeof defaultValue === 'string') {
		return defaultValue.trim();
	}
	return '';
}
