/**
 * Shared parsing/merging helpers for `data-brixter-bind`.
 *
 * Extracted so every consumer of the bind grammar stays in lock-step. Today the
 * only consumer is the runtime interpreter (`render.ts`); historically a Svelte
 * build-time preprocessor emitted the equivalent Svelte expressions, and the
 * markup field-inference layer reads the same grammar to expose bound paths as
 * editor fields. Keeping the grammar in one module means those layers can never
 * drift.
 *
 * ## Grammar
 *
 * `data-brixter-bind="target: path; target2: path2; ..."`
 *
 *   - split on `;` into parts;
 *   - the FIRST `:` of each part splits `target` from `path`;
 *   - the `target` side never contains a `:`, so there is no ambiguity
 *     (`style.object-position` is a single target).
 *
 * ## Target kinds
 *
 *   - `attr` — a plain HTML attribute (`href`, `alt`, `data-x`, and also the
 *     whole `style` / `class` attribute when written without a `.`). The
 *     resolved value REPLACES the entire attribute value.
 *   - `style` — `style.<prop>` merges a single CSS declaration into the existing
 *     `style` attribute instead of clobbering it. `<prop>` may be a CSS property
 *     (`object-position`, `background-image`) or a custom property (`--op`).
 */

/** A single parsed `data-brixter-bind` target. */
export type Binding =
	| { kind: 'attr'; attr: string; path: string }
	| { kind: 'style'; prop: string; path: string };

const STYLE_PREFIX = 'style.';

/** Parse a `data-brixter-bind` attribute value into ordered bindings. */
export function parseBindings(value: string): Binding[] {
	const bindings: Binding[] = [];
	for (const part of value.split(';')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const colon = trimmed.indexOf(':');
		if (colon === -1) continue;
		const target = trimmed.slice(0, colon).trim();
		const path = trimmed.slice(colon + 1).trim();
		if (!target || !path) continue;

		if (target.startsWith(STYLE_PREFIX)) {
			const prop = target.slice(STYLE_PREFIX.length).trim();
			// `style.` with no property is meaningless — skip it rather than emit
			// an empty declaration.
			if (prop) bindings.push({ kind: 'style', prop, path });
			continue;
		}

		bindings.push({ kind: 'attr', attr: target, path });
	}
	return bindings;
}

/** An ordered CSS declaration (`prop: value`). */
export interface StyleDeclaration {
	prop: string;
	value: string;
}

/**
 * Parse a `style` attribute value into ordered declarations. Splitting on `;`
 * and the first `:` mirrors what the browser does for the common cases; values
 * containing a literal `;` (rare in SSR-authored style attributes) are not
 * supported, which is also why bound values have `;` neutralised (see
 * {@link sanitizeStyleValue}).
 */
export function parseStyleDeclarations(style: string): StyleDeclaration[] {
	const declarations: StyleDeclaration[] = [];
	for (const part of style.split(';')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const colon = trimmed.indexOf(':');
		if (colon === -1) continue;
		const prop = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (prop) declarations.push({ prop, value });
	}
	return declarations;
}

/** Re-serialize declarations into a single `style` attribute value. */
export function serializeStyleDeclarations(declarations: StyleDeclaration[]): string {
	if (declarations.length === 0) return '';
	return declarations.map(({ prop, value }) => `${prop}: ${value}`).join('; ') + ';';
}

/**
 * Set/override a single declaration in place, preserving the position of an
 * existing declaration and appending a new one at the end otherwise.
 */
export function mergeStyleDeclaration(
	declarations: StyleDeclaration[],
	prop: string,
	value: string
): void {
	const existing = declarations.find((declaration) => declaration.prop === prop);
	if (existing) {
		existing.value = value;
	} else {
		declarations.push({ prop, value });
	}
}

/**
 * Neutralise characters that would let a bound value break out of its CSS
 * declaration or the surrounding HTML attribute.
 *
 * Trust model: `style.<prop>` values follow the same "content is semi-trusted"
 * posture as richtext `{@html}` — the CMS renders author-provided data — but a
 * per-page string must never be able to inject *additional* declarations, close
 * the attribute, or open a tag. So:
 *
 *   - `;` `{` `}` are dropped (they would start a new declaration/block);
 *   - `<` `>` are dropped (they would open/close a tag once the attribute is
 *     decoded);
 *   - newlines/tabs are folded to a single space.
 *
 * What is intentionally NOT stripped: quotes and parentheses, so legitimate
 * `url("…")` / `url('…')` values survive. Quotes are HTML-escaped to `&quot;`
 * at attribute-serialization time (see `escapeAttribute` in `render.ts`), which
 * the browser decodes back to `"` inside the value — keeping `url("…")` intact
 * without allowing an attribute breakout.
 */
export function sanitizeStyleValue(value: string): string {
	return value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/[;{}<>]/g, '')
		.trim();
}
