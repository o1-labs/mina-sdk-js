import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import { InvalidItnKeyError } from './errors.js';

const SEED_LENGTH = 32;
// DER prefix of a PKCS#8 Ed25519 private key; the 32-byte seed follows it.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * An ed25519 key that signs requests to a daemon's ITN GraphQL server. The
 * daemon accepts a request only when the key's public half is in its
 * `--itn-keys` list.
 *
 * Keys are exchanged as standard base64 with padding: the private key as its
 * 32-byte seed (the format of mina-perf-testing's orchestrator key and
 * fetcher_sk), and the public key as the 32-byte value for `--itn-keys`.
 */
export class ItnKey {
  private constructor(
    private readonly privateKey: KeyObject,
    private readonly seed: Buffer,
  ) {}

  /** Load a key from the base64 encoding of its 32-byte seed. */
  static fromBase64(seedBase64: string): ItnKey {
    const text = seedBase64.trim();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new InvalidItnKeyError('not base64');
    }
    return ItnKey.fromSeed(Buffer.from(text, 'base64'));
  }

  /** Create a key from its 32-byte seed. */
  static fromSeed(seed: Uint8Array): ItnKey {
    if (seed.length !== SEED_LENGTH) {
      throw new InvalidItnKeyError(`expected ${SEED_LENGTH} bytes, got ${seed.length}`);
    }
    const der = Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]);
    return new ItnKey(
      createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
      Buffer.from(seed),
    );
  }

  /** Generate a new random key. */
  static generate(): ItnKey {
    const { privateKey } = generateKeyPairSync('ed25519');
    const der = privateKey.export({ format: 'der', type: 'pkcs8' });
    return new ItnKey(privateKey, Buffer.from(der.subarray(der.length - SEED_LENGTH)));
  }

  /** The base64 encoding of the 32-byte seed; the inverse of {@link ItnKey.fromBase64}. */
  toBase64(): string {
    return this.seed.toString('base64');
  }

  /** The base64 public key, as the daemon expects it in `--itn-keys`. */
  publicKeyBase64(): string {
    const spki = createPublicKey(this.privateKey).export({ format: 'der', type: 'spki' });
    return Buffer.from(spki.subarray(spki.length - SEED_LENGTH)).toString('base64');
  }

  /** Sign `message` and return the base64 signature. @internal */
  signBase64(message: Uint8Array): string {
    return sign(null, message, this.privateKey).toString('base64');
  }

  /** Shows the public key only, so that a key never ends up in a log. */
  toString(): string {
    return `ItnKey(public: ${this.publicKeyBase64()})`;
  }

  toJSON(): string {
    return this.toString();
  }
}
