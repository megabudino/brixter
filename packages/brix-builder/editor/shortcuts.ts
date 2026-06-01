export const SHORTCUTS = {
	togglePageFlow: {
		key: '\\',
		mod: true,
		shift: false,
	},
	toggleInspector: {
		key: '\\',
		mod: true,
		shift: true,
	},
	closeModal: {
		key: 'Escape',
		mod: false,
		shift: false,
	},
} satisfies Record<string, { key: string; mod: boolean; shift: boolean }>;

export function matchesShortcut(
	event: KeyboardEvent,
	shortcut: { key: string; mod: boolean; shift: boolean },
): boolean {
	const modMatch = shortcut.mod ? event.metaKey || event.ctrlKey : true;
	const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
	return modMatch && shiftMatch && event.key === shortcut.key;
}
