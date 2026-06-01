export function isFieldEditDebugEnabled(): boolean {
	return (
		typeof globalThis !== 'undefined' &&
		(globalThis as { __BUILDER_FIELD_EDIT_DEBUG__?: boolean }).__BUILDER_FIELD_EDIT_DEBUG__ === true
	);
}

/** User-driven events only (click / mousedown / activate). */
export function logFieldEditEvent(
	scope: string,
	message: string,
	data?: Record<string, unknown>
): void {
	if (!isFieldEditDebugEnabled()) {
		return;
	}

	if (data) {
		console.log(`[builder-preview-field] ${scope} — ${message}`, data);
		return;
	}

	console.log(`[builder-preview-field] ${scope} — ${message}`);
}

export function describeFieldElement(element: Element | null | undefined): Record<string, unknown> {
	if (!(element instanceof HTMLElement)) {
		return { element: element == null ? null : String(element) };
	}

	const rect = element.getBoundingClientRect();
	return {
		tag: element.tagName.toLowerCase(),
		field: element.getAttribute('data-builder-field'),
		enhanced: element.dataset.builderFieldEnhanced ?? null,
		placeholderActive: element.hasAttribute('data-builder-placeholder-active'),
		ghostLabel: element.dataset.builderPreviewGhostLabel ?? null,
		text: element.textContent?.slice(0, 80) ?? '',
		rect: {
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			w: Math.round(rect.width),
			h: Math.round(rect.height)
		}
	};
}
