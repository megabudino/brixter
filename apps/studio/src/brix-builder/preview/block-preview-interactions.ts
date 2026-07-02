const NAVIGATION_LINK_SELECTOR = 'a[href]';
const PREVIEW_CONTENT_SELECTOR = '[data-brixter-preview-content]';

function isWithinPreviewContent(target: EventTarget | null): target is Element {
	return target instanceof Element && target.closest(PREVIEW_CONTENT_SELECTOR) !== null;
}

/**
 * Cancels the browser's default navigation for links inside the preview canvas
 * (including modifier/middle clicks that would open a new tab).
 *
 * We intentionally call only `preventDefault()` and never `stopPropagation()`:
 * the component's own click handlers (accordion toggles, tabs, …) still run,
 * so local interactivity keeps working — only the destructive navigation that
 * would replace the preview is suppressed.
 */
function blockLinkNavigation(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const link = target.closest(NAVIGATION_LINK_SELECTOR);
	if (!link || !link.closest(PREVIEW_CONTENT_SELECTOR)) {
		return;
	}

	event.preventDefault();
}

function blockFormSubmission(event: Event): void {
	if (isWithinPreviewContent(event.target)) {
		event.preventDefault();
	}
}

/**
 * Installs the preview navigation guard on the document that actually hosts the
 * rendered preview (the builder iframe document). A single capture-phase
 * listener covers every current and future link, so no per-element
 * neutralization or MutationObserver bookkeeping is required.
 */
export function attachPreviewInteractionGuard(document: Document): () => void {
	document.body.setAttribute('data-brixter-preview-canvas', 'true');

	document.addEventListener('click', blockLinkNavigation, true);
	document.addEventListener('auxclick', blockLinkNavigation, true);
	document.addEventListener('submit', blockFormSubmission, true);

	return () => {
		document.removeEventListener('click', blockLinkNavigation, true);
		document.removeEventListener('auxclick', blockLinkNavigation, true);
		document.removeEventListener('submit', blockFormSubmission, true);
		document.body.removeAttribute('data-brixter-preview-canvas');
	};
}
