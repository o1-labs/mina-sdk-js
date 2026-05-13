export const NANOMINA_PER_MINA = 1_000_000_000n;

export class CurrencyUnderflowError extends Error {
  constructor(
    readonly a: Currency,
    readonly b: Currency,
  ) {
    super(`subtraction would result in negative: ${a.toString()} - ${b.toString()}`);
    this.name = 'CurrencyUnderflowError';
  }
}

export class CurrencyParseError extends Error {
  constructor(value: string, hint?: string) {
    super(`invalid mina currency value ${JSON.stringify(value)}${hint ? `: ${hint}` : ''}`);
    this.name = 'CurrencyParseError';
  }
}

export class Currency {
  private readonly nano: bigint;

  private constructor(nano: bigint) {
    if (nano < 0n) throw new RangeError('Currency cannot be negative');
    this.nano = nano;
  }

  static fromMina(whole: number | bigint | string): Currency {
    if (typeof whole === 'string') {
      return new Currency(parseDecimal(whole));
    }
    const n = typeof whole === 'bigint' ? whole : BigInt(whole);
    return new Currency(n * NANOMINA_PER_MINA);
  }

  static fromNanomina(nano: number | bigint | string): Currency {
    const n = typeof nano === 'bigint' ? nano : BigInt(nano);
    return new Currency(n);
  }

  /** Parse a nanomina string as returned by the daemon GraphQL API. */
  static fromGraphQL(value: string): Currency {
    if (!/^\d+$/.test(value)) {
      throw new CurrencyParseError(value, 'expected integer nanomina string');
    }
    return new Currency(BigInt(value));
  }

  static zero(): Currency {
    return new Currency(0n);
  }

  get nanomina(): bigint {
    return this.nano;
  }

  /** Decimal MINA representation, always 9 fractional digits (e.g. "1.500000000"). */
  toMina(): string {
    const s = this.nano.toString();
    if (s.length > 9) {
      return `${s.slice(0, -9)}.${s.slice(-9)}`;
    }
    return `0.${s.padStart(9, '0')}`;
  }

  /** Nanomina value as a string — use this when passing to the GraphQL API. */
  toNanominaString(): string {
    return this.nano.toString();
  }

  toString(): string {
    return this.toMina();
  }

  isZero(): boolean {
    return this.nano === 0n;
  }

  equals(other: Currency): boolean {
    return this.nano === other.nano;
  }

  lessThan(other: Currency): boolean {
    return this.nano < other.nano;
  }

  lessThanOrEqual(other: Currency): boolean {
    return this.nano <= other.nano;
  }

  greaterThan(other: Currency): boolean {
    return this.nano > other.nano;
  }

  greaterThanOrEqual(other: Currency): boolean {
    return this.nano >= other.nano;
  }

  add(other: Currency): Currency {
    return new Currency(this.nano + other.nano);
  }

  sub(other: Currency): Currency {
    if (this.nano < other.nano) {
      throw new CurrencyUnderflowError(this, other);
    }
    return new Currency(this.nano - other.nano);
  }

  mul(n: number | bigint): Currency {
    const factor = typeof n === 'bigint' ? n : BigInt(n);
    if (factor < 0n) throw new RangeError('Currency.mul requires a non-negative factor');
    return new Currency(this.nano * factor);
  }
}

function parseDecimal(s: string): bigint {
  const trimmed = s.trim();
  if (trimmed.length === 0) throw new CurrencyParseError(s, 'empty string');

  const parts = trimmed.split('.');
  if (parts.length === 1) {
    const whole = parts[0]!;
    if (!/^\d+$/.test(whole)) throw new CurrencyParseError(s);
    return BigInt(whole) * NANOMINA_PER_MINA;
  }
  if (parts.length === 2) {
    const [left, right] = parts as [string, string];
    if (!/^\d*$/.test(left) || !/^\d+$/.test(right)) throw new CurrencyParseError(s);
    if (right.length > 9) throw new CurrencyParseError(s, 'more than 9 decimal places');
    const wholeNano = (left === '' ? 0n : BigInt(left)) * NANOMINA_PER_MINA;
    const fractionNano = BigInt(right.padEnd(9, '0'));
    return wholeNano + fractionNano;
  }
  throw new CurrencyParseError(s);
}
