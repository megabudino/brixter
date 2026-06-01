import { mount, unmount } from 'svelte';
import PreviewTextEditor from '../editor/PreviewTextEditor.svelte';
import RichTextEditor from '../editor/RichTextEditor.svelte';
import PreviewImageEditor from '../editor/PreviewImageEditor.svelte';
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

let globalSuppressBlurClose = false;

type FieldKind = 'richtext' | 'text' | 'image' | 'pending';

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
		node.toggleAttribute('data-builder-editing', currentParams.active);

		if (!currentParams.active) {
			teardownAll();
		}

		const blockRoot = getBlockRoot(node);
		const fields = Array.from(node.querySelectorAll<HTMLElement>('[data-builder-field]'));
		const liveFields = new Set(fields);
		const focusPath = currentParams.focusPath ?? null;

		for (const [element, state] of Array.from(mounts.entries())) {
			if (!liveFields.has(element) || !node.contains(element)) {
				teardownField(element);
				continue;
			}

			if (state.instance && state.kind !== 'image' && (state.path !== focusPath || !hasEditorHost(element))) {
				teardownField(element);
			}
		}

		for (const element of fields) {
			const rawPath = element.getAttribute('data-builder-field');
			if (!rawPath) {
				continue;
			}
			const path = resolveFieldPath(element, blockRoot);
			if (!path) {
				continue;
			}

			const fieldDef = getFieldByRawPath(currentParams.definition.fields, rawPath);
			const defaultValue = fieldDef?.default ?? getValueAtPath(currentParams.definition.defaults, path);
			let defaultString = resolveDefaultText(defaultValue);

			if (!defaultString) {
				defaultString = element.getAttribute('data-builder-default') || 
				                (fieldDef ? getFallbackText(rawPath.split('.').at(-1) || '') : '');
			}

			const plainDefaultString = defaultString.replace(/<[^>]*>/g, '').trim();
			if (plainDefaultString) {
				element.setAttribute('data-builder-placeholder', plainDefaultString);
			}

			const rawValue = getValueAtPath(currentParams.previewProps, path);
			const isEmpty = rawValue === undefined || rawValue === '' || (isRichTextValue(rawValue) && !rawValue.html.trim());
			element.toggleAttribute('data-builder-placeholder-active', isEmpty);


			if (!currentParams.active) {
				continue;
			}

			const kind = resolveFieldKind(element);
			const existing = mounts.get(element);

			if (path === focusPath || kind === 'image') {
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
		if (resolveFieldKind(element) === 'image') {
			return Boolean(element.nextElementSibling?.classList.contains('builder-preview-field-editor'));
		}
		return Boolean(element.querySelector('.builder-preview-field-editor'));
	}

	function resolveFieldPath(element: HTMLElement, blockRoot: HTMLElement): string | null {
		const rawPath = element.getAttribute('data-builder-field');
		if (!rawPath) {
			return null;
		}

		return materializeFieldPath(rawPath, blockRoot, element);
	}

	function setupPendingField(element: HTMLElement, path: string): void {
		const kind = resolveFieldKind(element);
		element.dataset.builderFieldEnhanced = 'pending';
		element.style.cursor = kind === 'image' ? 'pointer' : 'text';

		const handleClick = (event: Event) => {
			event.stopPropagation();
			activateField(element, path, event);
		};

		element.addEventListener('mousedown', handleClick);

		mounts.set(element, {
			path,
			kind: 'pending',
			element,
			instance: null,
			cleanup: () => {
				element.removeEventListener('mousedown', handleClick);
				element.style.removeProperty('cursor');
				delete element.dataset.builderFieldEnhanced;
			}
		});
	}

	function activateField(element: HTMLElement, path: string, event?: Event): void {
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
				'.builder-preview-field-editor, .ProseMirror, .builder-preview-text-editor, [data-builder-field-enhanced="pending"]'
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
		const isPlaceholderActive = element.hasAttribute('data-builder-placeholder-active');
		if (isPlaceholderActive) {
			element.removeAttribute('data-builder-placeholder-active');
		}
		const fieldStyle = captureFieldEditorStyle(element);
		if (isPlaceholderActive) {
			element.setAttribute('data-builder-placeholder-active', '');
		}
		element.dataset.builderFieldEnhanced = 'true';
		element.style.cursor = kind === 'image' ? 'pointer' : 'text';

		const mountHost = element.ownerDocument.createElement('div');
		mountHost.className = 'builder-preview-field-editor';
		mountHost.style.cursor = kind === 'image' ? 'default' : 'text';

		if (kind === 'image') {
			element.parentNode?.insertBefore(mountHost, element.nextSibling);
		} else {
			element.replaceChildren(mountHost);
		}

		const value = getValueAtPath(currentParams.previewProps, path);
		const shouldFocus = currentParams.focusPath === path;
		const placeholder = element.getAttribute('data-builder-placeholder') || '';

		let instance: Record<string, unknown>;

		if (kind === 'image') {
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
		} else {
			const textValue = asPlainText(value);
			instance = mount(PreviewTextEditor, {
				target: mountHost,
				props: {
					value: textValue,
					placeholder,
					multiline: inferMultiline(element),
					textStyle: fieldStyle,
					autofocus: shouldFocus,
					initialCaretOffset: shouldFocus ? (currentParams.caretOffset ?? null) : null,
					initialClickCoords: shouldFocus ? clickCoords : null,
					onChange: (nextValue: string) => currentParams.onUpdateText(path, nextValue),
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
				const input = state.element.querySelector('input, textarea') as
					| HTMLInputElement
					| HTMLTextAreaElement
					| null;
				if (!input) {
					return;
				}

				input.focus();

				if (clickCoords) {
					const doc = input.ownerDocument;
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

					if (range && input.contains(range.startContainer)) {
						const offset = range.startOffset;
						input.setSelectionRange(offset, offset);
						return;
					}
				}

				if (caretOffset != null) {
					const offset = Math.min(caretOffset, input.value.length);
					input.setSelectionRange(offset, offset);
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
			if (state.kind === 'image') {
				const nextSibling = state.element.nextElementSibling;
				if (nextSibling?.classList.contains('builder-preview-field-editor')) {
					nextSibling.remove();
				}
			}
		}

		state.cleanup?.();

		if (state.instance) {
			if (state.kind !== 'image' && state.kind !== 'pending') {
				const value = getValueAtPath(currentParams.previewProps, state.path);
				const defaultValue = element.getAttribute('data-builder-placeholder') || '';
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
			node.removeAttribute('data-builder-editing');
		}
	};
}

function getBlockRoot(node: HTMLElement): HTMLElement {
	return (node.closest('[data-builder-preview-block]') as HTMLElement | null) ?? node;
}

function resolveFieldKind(element: HTMLElement): FieldKind {
	const builderKind = element.getAttribute('data-builder-kind');

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

	const builderKind = element.getAttribute('data-builder-kind');
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
		element.textContent = text.trim() ? text : defaultValue;
		return;
	}

	if (kind === 'image' && typeof value === 'string') {
		(element as HTMLImageElement).src = value;
	}
}

function captureFieldEditorStyle(element: HTMLElement): string {
	const view = element.ownerDocument.defaultView;
	if (!view) {
		return '';
	}

	const computed = view.getComputedStyle(element);
	const height = element.offsetHeight;

	return [
		`font-family:${computed.fontFamily}`,
		`font-size:${computed.fontSize}`,
		`font-weight:${computed.fontWeight}`,
		`font-style:${computed.fontStyle}`,
		`line-height:${computed.lineHeight}`,
		`letter-spacing:${computed.letterSpacing}`,
		`text-transform:${computed.textTransform}`,
		`text-align:${computed.textAlign}`,
		`color:${computed.color}`,
		`font-variant:${computed.fontVariant}`,
		`font-stretch:${computed.fontStretch}`,
		`word-spacing:${computed.wordSpacing}`,
		`white-space:${computed.whiteSpace}`,
		height > 0 ? `min-height:${height}px` : ''
	]
		.filter(Boolean)
		.join(';');
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
