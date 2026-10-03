// Integration tests against a running daemon's ITN GraphQL server. They need
// MINA_ITN_URI (e.g. http://127.0.0.1:3086/graphql) and MINA_ITN_KEY (a base64
// ed25519 seed whose public key is in --itn-keys), and are skipped otherwise.
// None of them stops the daemon or sends transactions.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { Currency, GraphQLError } from '../../src/index.js';
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

// Operations for harness support (MinaProtocol/mina#19616): only with
// MINA_ITN_HARNESS=1, because older daemons do not have them. createAccounts
// sends transactions and also needs MINA_ITN_FEE_PAYER (a funded base58 key).
const harness = process.env.MINA_ITN_HARNESS === '1';
const feePayer = process.env.MINA_ITN_FEE_PAYER ?? '';

describe.skipIf(!uri || !seed || !harness)('ITN harness support', () => {
  it('commitId and scheduledTransactions', async () => {
    const c = client();
    expect((await c.commitId()).length).toBeGreaterThanOrEqual(7);
    expect(Array.isArray(await c.scheduledTransactions())).toBe(true);
  });

  it.skipIf(!feePayer)(
    'createAccounts funds the accounts under the handle',
    async () => {
      const c = client();
      const handle = randomUUID();
      const details = {
        feePayer,
        numAccounts: 3,
        fee: Currency.fromMina('0.1'),
        amount: Currency.fromMina('6'),
      };
      const created = await c.createAccounts(details, handle);
      expect(created.handle).toBe(handle);
      expect(created.accounts).toHaveLength(3);
      expect((await c.createAccounts(details, handle)).accounts[0]).toEqual(created.accounts[0]);
      for (let i = 0; i < 120 && (await c.scheduledTransactions()).includes(handle); i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      expect(await c.scheduledTransactions()).not.toContain(handle);
    },
    660_000,
  );
});
