import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { Currency, DaemonConnectionError, GraphQLError } from '../src/index.js';
import {
  InvalidItnKeyError,
  ItnClient,
  ItnHttpError,
  ItnKey,
  ItnSequencingError,
  ItnUnauthorizedError,
  type ZkappCommandsDetails,
} from '../src/itn/index.js';

const UUID = '5f0c2e6e-6a57-4bd4-9a8c-3a8f6c7e8b21';
// DER prefix of an SPKI Ed25519 public key; the 32-byte key follows it.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

interface Seen {
  body: Buffer;
  auth: string;
  isAuth: boolean;
  seq?: number;
}

/** Verify a request's signature the way the daemon does (graphql_internal.ml). */
function verifyRequest(key: ItnKey, body: Buffer, header: string): number | undefined {
  const parts = header.split(' ');
  expect(parts[1]).toBe(key.publicKeyBase64());
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(parts[1], 'base64')]),
    format: 'der',
    type: 'spki',
  });
  let message = body;
  let seq: number | undefined;
  if (parts.length === 7) {
    expect(parts.slice(3, 5)).toEqual([';', 'Sequencing']);
    seq = Number(parts[6]);
    const seqBytes = Buffer.alloc(2);
    seqBytes.writeUInt16BE(seq);
    message = Buffer.concat([seqBytes, Buffer.from(parts[5]), body]);
  } else {
    expect(parts.length).toBe(3);
  }
  expect(verify(null, message, publicKey, Buffer.from(parts[2], 'base64'))).toBe(true);
  return seq;
}

/**
 * A fake daemon: answers auth with `startSeq`, anything else with `respond`,
 * and checks every signature.
 */
function fakeDaemon(startSeq: number, respond: (body: string) => Response | Promise<Response>) {
  const key = ItnKey.generate();
  const seen: Seen[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = Buffer.from(init.body as Uint8Array);
    const auth = (init.headers as Record<string, string>).authorization;
    const seq = verifyRequest(key, body, auth);
    // The handshake is the request without sequence information; commitId
    // also selects auth, but sequenced.
    const isAuth = seq === undefined;
    seen.push({ body, auth, isAuth, seq });
    if (isAuth) {
      return json({
        data: {
          auth: {
            serverUuid: UUID,
            signerSequenceNumber: String(startSeq),
            libp2pPort: '8302',
            peerId: '12D3KooWGCh9hCWdBjXp7dvxhhPKoa264Ny3BByoCinc9gyDEWNF',
            isBlockProducer: true,
          },
        },
      });
    }
    return respond(body.toString());
  }) as unknown as typeof fetch;
  const client = new ItnClient({
    graphqlUri: 'http://daemon/graphql',
    key,
    fetch: fetchImpl,
    retries: 2,
    retryDelayMs: 0,
    logger: null,
  });
  return { key, seen, client };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const kinds = (seen: Seen[]) => seen.map((s) => (s.isAuth ? 'A' : 'R')).join('');
const seqs = (seen: Seen[]) => seen.filter((s) => !s.isAuth).map((s) => s.seq);
const inputOf = (s: Seen) => JSON.parse(s.body.toString()).variables.input;

describe('ItnClient', () => {
  it('runs auth with an unsequenced signature', async () => {
    const { client, seen } = fakeDaemon(4, () => json({}));
    expect(client.lastAuth()).toBeNull();
    const auth = await client.auth();
    expect(auth).toMatchObject({
      serverUuid: UUID,
      signerSequenceNumber: 4,
      libp2pPort: 8302,
      isBlockProducer: true,
    });
    expect(kinds(seen)).toBe('A');
    expect(client.lastAuth()).toEqual(auth);
  });

  it('counts sequenced requests up from the auth number', async () => {
    const { client, seen } = fakeDaemon(41, () =>
      json({
        data: {
          internalLogs: [
            {
              id: 3,
              timestamp: 't',
              message: 'm',
              metadata: [{ item: 'h', value: 12 }],
              process: null,
            },
          ],
        },
      }),
    );
    const logs = await client.internalLogs(0);
    await client.internalLogs(4);
    expect(logs[0]).toMatchObject({ id: 3, metadata: [{ item: 'h', value: 12 }], process: null });
    expect(seqs(seen)).toEqual([41, 42]);
    expect(kinds(seen)).toBe('ARR');
  });

  it('counts a request whose GraphQL result is an error', async () => {
    const { client, seen } = fakeDaemon(0, () =>
      json({ errors: [{ message: 'Not a block producing node' }] }),
    );
    await expect(client.slotsWon()).rejects.toBeInstanceOf(GraphQLError);
    await expect(client.slotsWon()).rejects.toBeInstanceOf(GraphQLError);
    expect(seqs(seen)).toEqual([0, 1]);
  });

  it('runs auth again after a 412 and repeats once', async () => {
    let first = true;
    const { client, seen } = fakeDaemon(9, () => {
      if (first) {
        first = false;
        return new Response('Invalid sequence number', { status: 412 });
      }
      return json({ data: { flushInternalLogs: '5' } });
    });
    expect(await client.flushInternalLogs(5)).toBe('5');
    expect(kinds(seen)).toBe('ARAR');
  });

  it('fails with ItnSequencingError after a second 412', async () => {
    const { client } = fakeDaemon(0, () => new Response('', { status: 412 }));
    await expect(client.stopScheduledTransactions('h')).rejects.toBeInstanceOf(ItnSequencingError);
  });

  it('does not retry a 401', async () => {
    let calls = 0;
    const client = new ItnClient({
      graphqlUri: 'http://daemon/graphql',
      key: ItnKey.generate(),
      retries: 3,
      retryDelayMs: 0,
      logger: null,
      fetch: (async () => {
        calls++;
        return new Response('Unauthorized', { status: 401 });
      }) as unknown as typeof fetch,
    });
    await expect(client.auth()).rejects.toBeInstanceOf(ItnUnauthorizedError);
    expect(calls).toBe(1);
  });

  it('does not repeat a failed mutation and starts a new session after it', async () => {
    const { client, seen } = fakeDaemon(0, () => new Response('down', { status: 503 }));
    const details = {
      durationMin: 1,
      tps: 0.5,
      memoPrefix: 't',
      maxFee: Currency.fromNanomina(2),
      minFee: Currency.fromNanomina(1),
      amount: Currency.fromNanomina(1000),
      receiver: 'B62qrPN5Y5yq8kGE3FbVKbGTdTAJNdtNtB5sNVpxyRwWGcDEhpMzc8g',
      senders: [],
    };
    const err = await client.schedulePayments(details).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DaemonConnectionError);
    expect((err as DaemonConnectionError).cause).toBeInstanceOf(ItnHttpError);
    expect(((err as DaemonConnectionError).cause as ItnHttpError).status).toBe(503);
    await client.schedulePayments(details).catch(() => undefined);
    expect(kinds(seen)).toBe('ARAR');
    expect(inputOf(seen[1])).toMatchObject({ amount: '1000', maxFee: '2', senders: [] });
  });

  it('wraps the sequence number', async () => {
    const { client, seen } = fakeDaemon(65535, () => json({ data: { zkAppCommandLimit: null } }));
    expect(await client.setZkappCommandLimit(null)).toBeNull();
    expect(await client.setZkappCommandLimit(null)).toBeNull();
    expect(seqs(seen)).toEqual([65535, 0]);
  });

  it('sends nonDefaultToken only when set', async () => {
    const { client, seen } = fakeDaemon(0, () => json({ data: { scheduleZkappCommands: 'h1' } }));
    const d: ZkappCommandsDetails = {
      maxCost: false,
      accountQueueSize: 10,
      deploymentFee: Currency.fromNanomina(1),
      maxFee: Currency.fromNanomina(2),
      minFee: Currency.fromNanomina(1),
      initBalance: Currency.fromNanomina(3),
      maxNewZkappBalance: Currency.fromNanomina(4),
      minNewZkappBalance: Currency.fromNanomina(1),
      maxBalanceChange: Currency.fromNanomina(5),
      minBalanceChange: Currency.fromNanomina(0),
      noPrecondition: false,
      memoPrefix: 'z',
      durationMin: 1,
      tps: 0.1,
      numNewAccounts: 0,
      numZkappsToDeploy: 1,
      feePayers: [],
    };
    expect(await client.scheduleZkappCommands(d)).toBe('h1');
    await client.scheduleZkappCommands({ ...d, nonDefaultToken: true });
    const inputs = seen.filter((s) => !s.isAuth).map(inputOf);
    expect(inputs[0]).not.toHaveProperty('nonDefaultToken');
    expect(inputs[1].nonDefaultToken).toBe(true);
  });

  it('sends concurrent requests one at a time, in order', async () => {
    const { client, seen } = fakeDaemon(0, () => json({ data: { slotsWon: [] } }));
    await Promise.all([client.slotsWon(), client.slotsWon(), client.slotsWon()]);
    expect(seqs(seen)).toEqual([0, 1, 2]);
    expect(kinds(seen)).toBe('ARRR');
  });

  it('gives up waiting for the lock when the signal aborts', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((r) => (release = r));
    const { client } = fakeDaemon(0, async () => {
      await blocked;
      return json({ data: { slotsWon: [] } });
    });
    const first = client.slotsWon();
    const controller = new AbortController();
    const second = client.slotsWon({ signal: controller.signal });
    controller.abort(new Error('cancelled'));
    await expect(second).rejects.toThrow('cancelled');
    release();
    await first;
  });
});

describe('ItnKey', () => {
  it('round-trips and hides the private key', () => {
    const key = ItnKey.generate();
    const again = ItnKey.fromBase64(` ${key.toBase64()}\n`);
    expect(again.publicKeyBase64()).toBe(key.publicKeyBase64());
    expect(Buffer.from(key.publicKeyBase64(), 'base64')).toHaveLength(32);
    expect(String(key)).toContain(key.publicKeyBase64());
    expect(String(key)).not.toContain(key.toBase64());
    expect(JSON.stringify({ key })).not.toContain(key.toBase64());
  });

  it('rejects bad keys', () => {
    expect(() => ItnKey.fromBase64('AAAA')).toThrow(InvalidItnKeyError);
    expect(() => ItnKey.fromBase64('not base64!')).toThrow(InvalidItnKeyError);
  });

  it('matches the Go and Rust SDKs on a fixed seed', () => {
    // Seed 0x00..0x1f; the public key is the RFC 8032 derivation.
    const key = ItnKey.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i));
    expect(key.publicKeyBase64()).toBe('A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=');
  });
});

describe('ITN harness support (MinaProtocol/mina#19616)', () => {
  it('parses the results and sends the handles', async () => {
    const { client, seen } = fakeDaemon(0, (body) => {
      if (body.includes('commitId')) return json({ data: { auth: { commitId: 'abc123' } } });
      if (body.includes('scheduledTransactions'))
        return json({ data: { scheduledTransactions: ['h1', 'h2'] } });
      if (body.includes('createAccounts'))
        return json({
          data: {
            createAccounts: {
              handle: 'h3',
              accounts: [{ publicKey: 'B62qa', privateKey: 'EKa' }],
            },
          },
        });
      return json({ data: { schedulePayments: 'h4' } });
    });
    expect(await client.commitId()).toBe('abc123');
    expect(await client.scheduledTransactions()).toEqual(['h1', 'h2']);
    const details = {
      feePayer: 'EKfee',
      numAccounts: 2,
      fee: Currency.fromNanomina(100),
      amount: Currency.fromNanomina(5000),
    };
    const created = await client.createAccounts(details);
    expect(created).toEqual({
      handle: 'h3',
      accounts: [{ publicKey: 'B62qa', privateKey: 'EKa' }],
    });
    await client.createAccounts(details, 'u1');
    const payments = {
      durationMin: 1,
      tps: 0.5,
      memoPrefix: 'm',
      maxFee: Currency.fromNanomina(20),
      minFee: Currency.fromNanomina(10),
      amount: Currency.fromNanomina(1),
      receiver: 'B62qr',
      senders: [],
    };
    expect(await client.schedulePaymentsWithHandle(payments, 'u2')).toBe('h4');

    const vars = seen
      .filter((s) => !s.isAuth)
      .map(
        (s) => (JSON.parse(s.body.toString()) as { variables: Record<string, unknown> }).variables,
      );
    expect(vars[2]).toEqual({
      input: { feePayer: 'EKfee', numAccounts: 2, fee: '100', amount: '5000' },
      handle: null,
    });
    expect(vars[3]?.handle).toBe('u1');
    expect(vars[4]?.handle).toBe('u2');
    expect((vars[4]?.input as Record<string, unknown>).maxFee).toBe('20');
  });
});
