/**
 * "Did you mean …?" for names a person typed.
 *
 * A misspelled prop or brik name is the most common authoring mistake there is,
 * and the difference between an error that names the fix and one that does not
 * is most of the value of reporting it at all.
 */

/** The closest candidate within a couple of single-character edits, if any. */
export function nearestName(value: string, candidates: Iterable<string>): string | undefined {
	const limit = value.length <= 4 ? 1 : 2;
	let best: string | undefined;
	let bestDistance = limit + 1;

	for (const candidate of candidates) {
		if (candidate.toLowerCase() === value.toLowerCase()) return candidate;
		const distance = editDistance(value, candidate, limit);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}

	return best;
}

/**
 * Optimal string alignment distance — Levenshtein plus transposition.
 *
 * Counting a swap as one edit rather than two matters here: `Hreo` for `Hero`
 * and `nmae` for `name` are the typos people actually make, and plain
 * Levenshtein puts both just out of reach of a useful threshold.
 *
 * Gives up early when the length difference alone exceeds `limit`.
 */
function editDistance(a: string, b: string, limit: number): number {
	if (Math.abs(a.length - b.length) > limit) return limit + 1;

	const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, index) => index)];

	for (let i = 1; i <= a.length; i += 1) {
		rows[i] = [i];
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, rows[i - 2][j - 2] + 1);
			}
			rows[i][j] = best;
		}
	}

	return rows[a.length][b.length];
}
