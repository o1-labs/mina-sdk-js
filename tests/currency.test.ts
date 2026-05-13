import { describe, expect, it } from 'vitest';
import { Currency, CurrencyParseError, CurrencyUnderflowError } from '../src/index.js';

describe('Currency', () => {
  it('parses whole MINA from numbers, bigints, and strings', () => {
    expect(Currency.fromMina(10).toNanominaString()).toBe('10000000000');
    expect(Currency.fromMina(10n).toNanominaString()).toBe('10000000000');
    expect(Currency.fromMina('10').toNanominaString()).toBe('10000000000');
  });

  it('parses decimal MINA with up to 9 fractional digits', () => {
    expect(Currency.fromMina('1.5').toNanominaString()).toBe('1500000000');
    expect(Currency.fromMina('0.000000001').toNanominaString()).toBe('1');
    expect(Currency.fromMina('.5').toNanominaString()).toBe('500000000');
  });

  it('rejects more than 9 fractional digits', () => {
    expect(() => Currency.fromMina('1.0000000001')).toThrow(CurrencyParseError);
  });

  it('rejects non-numeric strings', () => {
    expect(() => Currency.fromMina('abc')).toThrow(CurrencyParseError);
    expect(() => Currency.fromMina('1.2.3')).toThrow(CurrencyParseError);
    expect(() => Currency.fromMina('')).toThrow(CurrencyParseError);
  });

  it('parses GraphQL nanomina strings', () => {
    expect(Currency.fromGraphQL('1500000000').toMina()).toBe('1.500000000');
    expect(() => Currency.fromGraphQL('1.5')).toThrow(CurrencyParseError);
  });

  it('renders decimal MINA with 9 fractional digits', () => {
    expect(Currency.fromNanomina(1n).toMina()).toBe('0.000000001');
    expect(Currency.fromNanomina(0n).toMina()).toBe('0.000000000');
    expect(Currency.fromMina(1).toMina()).toBe('1.000000000');
    expect(Currency.fromMina('1.5').toString()).toBe('1.500000000');
  });

  it('supports arithmetic and comparisons', () => {
    const a = Currency.fromMina(10);
    const b = Currency.fromMina('1.5');
    expect(a.add(b).toString()).toBe('11.500000000');
    expect(a.sub(b).toString()).toBe('8.500000000');
    expect(b.mul(3).toString()).toBe('4.500000000');
    expect(a.greaterThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(true);
    expect(a.equals(Currency.fromMina(10))).toBe(true);
  });

  it('throws on subtraction underflow', () => {
    expect(() => Currency.fromMina(1).sub(Currency.fromMina(2))).toThrow(
      CurrencyUnderflowError,
    );
  });

  it('rejects negative multipliers', () => {
    expect(() => Currency.fromMina(1).mul(-1)).toThrow(RangeError);
  });

  it('isZero distinguishes zero from non-zero', () => {
    expect(Currency.zero().isZero()).toBe(true);
    expect(Currency.fromNanomina(1n).isZero()).toBe(false);
  });
});
