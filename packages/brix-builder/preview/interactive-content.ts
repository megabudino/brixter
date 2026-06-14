export const INTERACTIVE_SELECTOR = [
	'a',
	'button',
	'input[type="submit"]',
	'input[type="button"]',
	'input[type="reset"]',
	'input[type="checkbox"]',
	'input[type="radio"]',
	'label[for]',
	'select',
	'textarea',
	'summary',
	'[role="button"]',
	'[role="link"]',
].join(', ');

const EDITOR_SELECTOR =
	'.builder-preview-field-editor, .builder-preview-text-editor, .ProseMirror, .builder-richtext-inline-editor';

export function isInteractiveFieldHost(element: HTMLElement): boolean {
	const tag = element.tagName.toLowerCase();
	if (tag === 'a' || tag === 'button') {
		return true;
	}

	const role = element.getAttribute('role');
	return role === 'button' || role === 'link';
}

export function isEditorInteractionTarget(element: Element): boolean {
	return Boolean(element.closest(EDITOR_SELECTOR));
}

export function isFieldActivationTarget(element: Element): boolean {
	return Boolean(
		element.closest('[data-brixter-field-enhanced="pending"], [data-brixter-field-enhanced="true"]')
	);
}

export function isPreviewContentInteractiveTarget(element: Element): boolean {
	if (!element.closest('[data-brixter-preview-content]')) {
		return false;
	}

	return Boolean(element.closest(INTERACTIVE_SELECTOR));
}

export function neutralizeInteractiveElement(element: HTMLElement): void {
	if (element.dataset.builderPreviewNeutralized === 'true') {
		return;
	}

	const tag = element.tagName.toLowerCase();
	if (tag === 'a') {
		for (const attribute of ['href', 'target', 'download'] as const) {
			const value = element.getAttribute(attribute);
			if (value == null) {
				continue;
			}

			element.dataset[`builderPreview${attribute[0].toUpperCase()}${attribute.slice(1)}`] = value;
			element.removeAttribute(attribute);
		}
	}

	element.dataset.builderPreviewNeutralized = 'true';
}

export function syncNeutralizedInteractiveElements(root: ParentNode): void {
	for (const element of root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
		if (!element.closest('[data-brixter-preview-content]')) {
			continue;
		}

		neutralizeInteractiveElement(element);
	}
}
