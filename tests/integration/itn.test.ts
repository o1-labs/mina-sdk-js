// Integration tests against a running daemon's ITN GraphQL server. They need
// MINA_ITN_URI (e.g. http://127.0.0.1:3086/graphql) and MINA_ITN_KEY (a base64
// ed25519 seed whose public key is in --itn-keys), and are skipped otherwise.
// None of them stops the daemon or sends transactions.
import { describe, expect, it } from 'vitest';

import { GraphQLError } from '../../src/index.js';
import { ItnClient, ItnKey, ItnUnauthorizedError } from '../../src/itn/index.js';

const uri = process.env.MINA_ITN_URI ?? '';
const seed = process.env.MINA_ITN_KEY ?? '';
const client = () => new ItnClient({ graphqlUri: uri, key: ItnKey.fromBase64(seed), logger: null });

describe.skipIf(!uri || !seed)('ITN server', () => {
  it('auth', async () => {
    const auth = await client().auth();
    expect(auth.serverUuid).not.toBe('');
    expect(auth.libp2pPort).toBeGreaterThan(0);
  });

  it('rejects an unknown key', async () => {
    const c = new ItnClient({ graphqlUri: uri, key: ItnKey.generate(), logger: null });
    await expect(c.auth()).rejects.toBeInstanceOf(ItnUnauthorizedError);
  });

  it('sequenced requests in a row', async () => {
    const c = client();
    for (let i = 0; i < 3; i++) await c.internalLogs(0);
    expect(await c.setZkappCommandLimit(7)).toBe(7);
    expect(await c.setZkappCommandLimit(null)).toBeNull();
  });

  // Two clients with the same key share the daemon's sequence number; the
  // first one's number goes stale (412) and it must recover with a new auth.
  it('recovers from a stale sequence number', async () => {
    const a = client();
    const b = client();
    await a.internalLogs(0);
    await b.internalLogs(0);
    await a.internalLogs(0);
  });

  it('reads and flushes internal logs', async () => {
    const c = client();
    const logs = await c.internalLogs(0);
    if (logs.length === 0) return;
    const last = logs[logs.length - 1].id;
    await c.flushInternalLogs(last);
    for (const l of await c.internalLogs(0)) expect(l.id).toBeGreaterThan(last);
  });

  it('slotsWon answers with slots or a GraphQL error', async () => {
    await client()
      .slotsWon()
      .catch((e: unknown) => expect(e).toBeInstanceOf(GraphQLError));
  });

  it('accepts an empty gating update', async () => {
    await client().updateGating({
      addedPeers: [],
      cleanAddedPeers: false,
      isolate: false,
      bannedPeers: [],
      trustedPeers: [],
    });
  });
});
