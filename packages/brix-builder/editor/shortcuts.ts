export const SHORTCUTS = {
	togglePageFlow: {
		key: '\\',
		mod: true,
	},
	closeModal: {
		key: 'Escape',
		mod: false,
	},
} satisfies Record<string, { key: string; mod: boolean }>;

export function matchesShortcut(
	event: KeyboardEvent,
	shortcut: { key: string; mod: boolean },
): boolean {
	const modMatch = shortcut.mod ? event.metaKey || event.ctrlKey : true;
	return modMatch && event.key === shortcut.key;
}
