import {
	INTERACTIVE_SELECTOR,
	isEditorInteractionTarget,
	isFieldActivationTarget,
	isPreviewContentInteractiveTarget,
	syncNeutralizedInteractiveElements,
} from './interactive-content.js';

function markInert(element: HTMLElement): void {
	if (element.dataset.builderPreviewInert === 'true') {
		return;
	}

	if (element.hasAttribute('tabindex')) {
		element.dataset.builderPreviewInertTabindex = element.getAttribute('tabindex') ?? '';
	}

	element.dataset.builderPreviewInert = 'true';
	element.setAttribute('tabindex', '-1');
	element.setAttribute('aria-disabled', 'true');
}

function syncInertInteractiveElements(root: ParentNode): void {
	syncNeutralizedInteractiveElements(root);

	for (const element of root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
		if (!element.closest('[data-brixter-preview-content]')) {
			continue;
		}

		markInert(element);
	}
}

function blockInteractiveAction(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element) || !isPreviewContentInteractiveTarget(target)) {
		return;
	}

	if (isEditorInteractionTarget(target)) {
		return;
	}

	if (event.type === 'mousedown' && isFieldActivationTarget(target)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
}

function blockInteractiveKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Enter' && event.key !== ' ') {
		return;
	}

	const target = event.target;
	if (!(target instanceof Element) || !isPreviewContentInteractiveTarget(target)) {
		return;
	}

	if (isEditorInteractionTarget(target)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
}

export function attachPreviewInteractionGuard(document: Document): () => void {
	document.body.setAttribute('data-brixter-preview-canvas', 'true');
	syncInertInteractiveElements(document);

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'childList') {
				for (const node of record.addedNodes) {
					if (node instanceof HTMLElement) {
						syncInertInteractiveElements(node);
					}
				}
				continue;
			}

			if (record.type === 'attributes' && record.target instanceof HTMLElement) {
				syncInertInteractiveElements(record.target);
			}
		}
	});

	observer.observe(document.body, {
		attributes: true,
		attributeFilter: ['href', 'role', 'type', 'for', 'data-brixter-field-enhanced'],
		childList: true,
		subtree: true,
	});

	const events = ['click', 'auxclick', 'mousedown', 'pointerdown', 'submit'] as const;
	for (const type of events) {
		document.addEventListener(type, blockInteractiveAction, true);
	}
	document.addEventListener('keydown', blockInteractiveKeydown, true);

	return () => {
		observer.disconnect();
		for (const type of events) {
			document.removeEventListener(type, blockInteractiveAction, true);
		}
		document.removeEventListener('keydown', blockInteractiveKeydown, true);
		document.body.removeAttribute('data-brixter-preview-canvas');
	};
}
