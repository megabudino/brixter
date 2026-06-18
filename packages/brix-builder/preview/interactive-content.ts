export function isInteractiveFieldHost(element: HTMLElement): boolean {
	const tag = element.tagName.toLowerCase();
	if (tag === 'a' || tag === 'button') {
		return true;
	}

	const role = element.getAttribute('role');
	return role === 'button' || role === 'link';
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
