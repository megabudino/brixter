import { describe, expect, it } from 'vitest';
import {
	parseCondition,
	parseEachHeader,
	parseReference,
	TemplateSyntaxError
} from './expression.js';

describe('parseReference', () => {
	it('reads a bare path', () => {
		const reference = parseReference('headline');

		expect(reference.path).toBe('headline');
		expect(reference.tags).toEqual([]);
		expect(reference.hasFallback).toBe(false);
	});

	it('reads a dotted path', () => {
		expect(parseReference('cta.href').path).toBe('cta.href');
	});

	it('reads prefixed tags', () => {
		const reference = parseReference('@richtext @required headline');

		expect(reference.tags.map((tag) => tag.name)).toEqual(['richtext', 'required']);
		expect(reference.path).toBe('headline');
	});

	it('reads tag arguments', () => {
		const [tag] = parseReference("@enum('yellow','blue','green') accent").tags;

		expect(tag.name).toBe('enum');
		expect(tag.args).toEqual(['yellow', 'blue', 'green']);
	});

	it('reads an empty argument list', () => {
		expect(parseReference('@enum() accent').tags[0].args).toEqual([]);
	});

	it('reads a `??` fallback', () => {
		const reference = parseReference("eyebrow ?? 'Pricing'");

		expect(reference.hasFallback).toBe(true);
		expect(reference.fallback).toBe('Pricing');
	});

	it.each([
		['count ?? 12', 12],
		['count ?? -3.5', -3.5],
		['flag ?? true', true],
		['flag ?? false', false],
		['thing ?? null', null]
	])('reads the literal in `%s`', (source, expected) => {
		expect(parseReference(source).fallback).toBe(expected);
	});

	it('keeps escapes inside a string literal', () => {
		expect(parseReference("label ?? 'it\\'s here'").fallback).toBe("it's here");
	});

	it.each([
		['', 'a path is required'],
		['@ headline', 'a tag needs a name'],
		['headline extra', 'trailing junk is rejected'],
		["headline ?? 'unterminated", 'an unterminated string is rejected'],
		['@enum(yellow) accent', 'unquoted tag arguments are rejected']
	])('rejects `%s` — %s', (source) => {
		expect(() => parseReference(source)).toThrow(TemplateSyntaxError);
	});

	it('reports the offset of the failure', () => {
		try {
			parseReference('headline nope', 100);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(TemplateSyntaxError);
			expect((error as TemplateSyntaxError).offset).toBeGreaterThanOrEqual(100);
		}
	});
});

describe('parseCondition', () => {
	it('reads a bare reference', () => {
		expect(parseCondition('plan.featured')).toMatchObject({
			kind: 'reference',
			path: 'plan.featured'
		});
	});

	it('reads a negation', () => {
		expect(parseCondition('!plan.hidden')).toMatchObject({
			kind: 'not',
			operand: { kind: 'reference', path: 'plan.hidden' }
		});
	});

	it.each(['==', '!=', '>', '<', '>=', '<='])('reads the `%s` comparison', (operator) => {
		expect(parseCondition(`count ${operator} 3`)).toMatchObject({
			kind: 'compare',
			operator,
			left: { kind: 'reference', path: 'count' },
			right: { kind: 'literal', value: 3 }
		});
	});

	it('compares against a string literal', () => {
		expect(parseCondition("plan.tier == 'pro'")).toMatchObject({
			operator: '==',
			right: { kind: 'literal', value: 'pro' }
		});
	});

	it('rejects a function call', () => {
		expect(() => parseCondition('count()')).toThrow(TemplateSyntaxError);
	});
});

describe('parseEachHeader', () => {
	it('reads a collection and its alias', () => {
		const header = parseEachHeader(' plans as plan');

		expect(header.collection.path).toBe('plans');
		expect(header.alias).toBe('plan');
		expect(header.indexAlias).toBeUndefined();
	});

	it('reads an index binding', () => {
		expect(parseEachHeader('plans as plan, index')).toMatchObject({
			alias: 'plan',
			indexAlias: 'index'
		});
	});

	it('reads tags on the collection', () => {
		const header = parseEachHeader('@required @min(1) plans as plan');

		expect(header.collection.tags.map((tag) => tag.name)).toEqual(['required', 'min']);
	});

	it('does not mistake `as` inside a string literal for the binding', () => {
		const header = parseEachHeader("@enum('as') kinds as kind");

		expect(header.collection.path).toBe('kinds');
		expect(header.alias).toBe('kind');
	});

	it('rejects a missing binding', () => {
		expect(() => parseEachHeader('plans')).toThrow(TemplateSyntaxError);
	});
});
