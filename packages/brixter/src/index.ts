/**
 * Public runtime entry for the `brixter` package (the `.` export).
 *
 * Ships the theming primitives shared by consumers (and Brixter Studio):
 * a `<ThemeController>` component plus the `themePreference` store helpers.
 */
export { default as ThemeController } from './ThemeController.svelte';
export {
	themePreferences,
	themePreferenceLabels,
	themePreference,
	isThemePreference,
	readStoredThemePreference,
	DEFAULT_THEME_PREFERENCE,
	THEME_STORAGE_KEY,
	type ThemePreference
} from './theme.ts';
