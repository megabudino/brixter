/**
 * Human labels derived from prop keys.
 *
 * With the schema inferred from the template, an editor label is one more thing
 * nobody should have to write down: `ctaLabel` reads perfectly well as "Cta
 * label", and `@label('…')` stays available for the cases where it does not.
 */

/** `ctaLabel` → `Cta label`; `cta_href` → `Cta href`. */
export function humanizeKey(value: string): string {
	const spaced = value
		.replace(/[_-]+/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.trim();
	if (!spaced) return value;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Singular label for one entry of a collection: `plans` → `Plan`,
 * `categories` → `Category`, `reviews` → `Review`.
 *
 * English-only and intentionally shallow — it produces a label shown next to an
 * "Add" button, and `@label` overrides it when the guess reads badly.
 */
export function singularLabel(value: string): string {
	return humanizeKey(singularize(value));
}

function singularize(value: string): string {
	if (/[^aeiou]ies$/i.test(value)) return value.slice(0, -3) + 'y';
	if (/(s|x|z|ch|sh)es$/i.test(value)) return value.slice(0, -2);
	if (/[^s]s$/i.test(value)) return value.slice(0, -1);
	return value;
}
