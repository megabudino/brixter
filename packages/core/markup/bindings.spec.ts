import { describe, expect, it } from 'vitest';
import {
	mergeStyleDeclaration,
	parseBindings,
	parseStyleDeclarations,
	sanitizeStyleValue,
	serializeStyleDeclarations,
	type StyleDeclaration
} from './bindings';

describe('parseBindings', () => {
	it('parses plain attribute targets (whole-attribute replace)', () => {
		expect(parseBindings('href: cta.href; target: cta.target')).toEqual([
			{ kind: 'attr', attr: 'href', path: 'cta.href' },
			{ kind: 'attr', attr: 'target', path: 'cta.target' }
		]);
	});

	it('treats whole `style:` / `class:` as plain attribute targets', () => {
		expect(parseBindings('style: s; class: c')).toEqual([
			{ kind: 'attr', attr: 'style', path: 's' },
			{ kind: 'attr', attr: 'class', path: 'c' }
		]);
	});

	it('parses `style.<prop>` into a style target (CSS prop and custom prop)', () => {
		expect(parseBindings('style.object-position: pos; style.--op: pos')).toEqual([
			{ kind: 'style', prop: 'object-position', path: 'pos' },
			{ kind: 'style', prop: '--op', path: 'pos' }
		]);
	});

	it('splits only on the FIRST colon, so the target never carries a colon', () => {
		// A URL-ish path with a colon would still keep the whole right side as path;
		// the target (left of first colon) is unambiguous.
		expect(parseBindings('style.background-image: bg')).toEqual([
			{ kind: 'style', prop: 'background-image', path: 'bg' }
		]);
	});

	it('skips empty parts, colon-less parts, and `style.` with no property', () => {
		expect(parseBindings('; href: a ;; style.: x; nope')).toEqual([
			{ kind: 'attr', attr: 'href', path: 'a' }
		]);
	});
});

describe('style declaration parse/serialize/merge', () => {
	it('parses ordered declarations, ignoring blanks', () => {
		expect(parseStyleDeclarations('object-position: 47.5% 50%; color: red;')).toEqual([
			{ prop: 'object-position', value: '47.5% 50%' },
			{ prop: 'color', value: 'red' }
		]);
	});

	it('serializes back to a single style value with a trailing semicolon', () => {
		const decls: StyleDeclaration[] = [
			{ prop: 'object-position', value: '50% 28%' },
			{ prop: '--op', value: 'red' }
		];
		expect(serializeStyleDeclarations(decls)).toBe('object-position: 50% 28%; --op: red;');
	});

	it('serializes an empty declaration list to an empty string', () => {
		expect(serializeStyleDeclarations([])).toBe('');
	});

	it('overrides an existing declaration in place (preserving order)', () => {
		const decls = parseStyleDeclarations('object-position: 47.5% 50%; color: red;');
		mergeStyleDeclaration(decls, 'object-position', '50% 28%');
		expect(serializeStyleDeclarations(decls)).toBe('object-position: 50% 28%; color: red;');
	});

	it('appends a new declaration at the end', () => {
		const decls = parseStyleDeclarations('color: red;');
		mergeStyleDeclaration(decls, 'object-position', '50% 28%');
		expect(serializeStyleDeclarations(decls)).toBe('color: red; object-position: 50% 28%;');
	});
});

describe('sanitizeStyleValue', () => {
	it('drops CSS/HTML breakout characters', () => {
		expect(sanitizeStyleValue('red; background: url(evil)')).toBe('red background: url(evil)');
		expect(sanitizeStyleValue('a{b}c')).toBe('abc');
		expect(sanitizeStyleValue('x<script>y')).toBe('xscripty');
	});

	it('folds newlines/tabs to a single space and trims', () => {
		expect(sanitizeStyleValue('  50%\n\t28%  ')).toBe('50% 28%');
	});

	it('keeps quotes and parentheses so url() values survive', () => {
		expect(sanitizeStyleValue('url("/a.jpg")')).toBe('url("/a.jpg")');
		expect(sanitizeStyleValue("url('/a.jpg')")).toBe("url('/a.jpg')");
	});
});
