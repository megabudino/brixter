/**
 * `style` attribute handling for interpolated values.
 *
 * A style attribute is the one place where a missing value must not collapse
 * into an empty string: `style="object-position: {imagePosition};"` with no
 * `imagePosition` should leave the *other* declarations standing and drop only
 * that one, so the markup's own defaults survive. That was the whole point of
 * the old `data-brixter-bind="style.<prop>: path"` target; with interpolation it
 * falls out of a rule about declarations rather than a syntax of its own.
 */

/**
 * Neutralise characters that would let an interpolated value break out of its
 * CSS declaration or the surrounding HTML attribute.
 *
 * Trust model: page content is semi-trusted — the CMS renders what an author
 * wrote — but a per-page string must never be able to inject *additional*
 * declarations, close the attribute, or open a tag. So:
 *
 *   - `;` `{` `}` are dropped (they would start a new declaration/block);
 *   - `<` `>` are dropped (they would open/close a tag once decoded);
 *   - newlines/tabs fold to a single space.
 *
 * What is intentionally NOT stripped: quotes and parentheses, so legitimate
 * `url("…")` values survive. Quotes are HTML-escaped to `&quot;` at
 * serialization time, which the browser decodes back inside the value.
 */
export function sanitizeStyleValue(value: string): string {
	return value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/[;{}<>]/g, '')
		.trim();
}

/** One `prop: value` chunk of a style attribute, as assembled from the template. */
export interface StyleChunk {
	text: string;
	/** True when an interpolation inside this chunk resolved to nothing. */
	incomplete: boolean;
}

/**
 * Join style chunks, dropping any whose interpolation came up empty.
 *
 * A chunk with no interpolation at all is static markup and always survives.
 */
export function joinStyleChunks(chunks: StyleChunk[]): string {
	const kept = chunks
		.filter((chunk) => !chunk.incomplete)
		.map((chunk) => chunk.text.trim())
		.filter(Boolean);
	if (kept.length === 0) return '';
	return kept.join('; ') + ';';
}
