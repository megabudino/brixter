export function syncPreviewHeadAssets(
	frameDocument: Document,
	sourceDocument: Document,
	observe = false
): () => void {
	function sync(): void {
		clearManagedHeadAssets(frameDocument);

		for (const asset of sourceDocument.head.querySelectorAll(
			'link[rel="stylesheet"], link[rel="preconnect"], style'
		)) {
			const clone = asset.cloneNode(true) as HTMLElement;
			clone.dataset.builderPreviewHeadAsset = 'true';
			if (asset instanceof HTMLLinkElement && clone instanceof HTMLLinkElement && asset.href) {
				clone.href = asset.href;
			}
			frameDocument.head.append(clone);
		}
	}

	sync();

	if (!observe) {
		return () => {
			clearManagedHeadAssets(frameDocument);
		};
	}

	let syncQueued = false;
	function queueSync(): void {
		if (syncQueued) {
			return;
		}
		syncQueued = true;
		requestAnimationFrame(() => {
			syncQueued = false;
			sync();
		});
	}

	const observer = new MutationObserver(queueSync);
	observer.observe(sourceDocument.head, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true
	});

	return () => {
		observer.disconnect();
		clearManagedHeadAssets(frameDocument);
	};
}

export function syncPreviewTheme(frameDocument: Document): () => void {
	const frameWindow = frameDocument.defaultView ?? window;
	const systemTheme = frameWindow.matchMedia('(prefers-color-scheme: dark)');

	const applyTheme = () => {
		const isDark = systemTheme.matches;
		frameDocument.documentElement.classList.toggle('dark', isDark);
		frameDocument.body.classList.toggle('dark', isDark);
		frameDocument.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
		frameDocument.body.style.colorScheme = isDark ? 'dark' : 'light';
	};

	applyTheme();

	systemTheme.addEventListener('change', applyTheme);
	return () => {
		systemTheme.removeEventListener('change', applyTheme);
	};
}

function clearManagedHeadAssets(frameDocument: Document): void {
	for (const node of Array.from(
		frameDocument.head.querySelectorAll('[data-builder-preview-head-asset="true"]')
	)) {
		node.remove();
	}
}
