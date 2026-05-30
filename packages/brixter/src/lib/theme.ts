import { writable } from 'svelte/store';

export const themePreferences = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof themePreferences)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const THEME_STORAGE_KEY = 'brixter:theme';

export const themePreferenceLabels: Record<ThemePreference, string> = {
	light: 'Light',
	dark: 'Dark',
	system: 'System'
};

export const themePreference = writable<ThemePreference>(DEFAULT_THEME_PREFERENCE);

export function isThemePreference(value: unknown): value is ThemePreference {
	return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function readStoredThemePreference(): ThemePreference {
	if (typeof localStorage === 'undefined') return DEFAULT_THEME_PREFERENCE;

	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
	} catch {
		return DEFAULT_THEME_PREFERENCE;
	}
}

export function writeStoredThemePreference(preference: ThemePreference): void {
	if (typeof localStorage === 'undefined') return;

	try {
		localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// Ignore storage errors so theme changes still work for the current session.
	}
}

export function resolveThemePreference(preference: ThemePreference, systemDark: boolean): boolean {
	return preference === 'system' ? systemDark : preference === 'dark';
}
