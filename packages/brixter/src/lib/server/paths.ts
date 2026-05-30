export function commonPrefix(paths: string[]): string {
	if (paths.length === 0) return '';
	if (paths.length === 1) {
		return paths[0];
	}

	const split = paths.map((p) => p.split('/'));
	const prefix: string[] = [];

	for (let i = 0; i < split[0].length; i++) {
		const segment = split[0][i];
		if (split.every((parts) => parts[i] === segment)) {
			prefix.push(segment);
		} else {
			break;
		}
	}

	return prefix.join('/');
}
