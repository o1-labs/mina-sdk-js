import { describe, expect, it, vi } from 'vitest';
import {
  AccountNotFoundError,
  Currency,
  DaemonConnectionError,
  GraphQLError,
  MinaClient,
} from '../src/index.js';

function mockResponse(body: unknown, init: Partial<{ status: number }> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(fetchImpl: typeof fetch, overrides: Partial<{ retries: number }> = {}) {
  return new MinaClient({
    fetch: fetchImpl,
    retries: overrides.retries ?? 1,
    retryDelayMs: 0,
    timeoutMs: 1000,
    logger: null,
  });
}

describe('MinaClient', () => {
  it('rejects invalid configuration eagerly', () => {
    expect(() => new MinaClient({ retries: 0 })).toThrow(RangeError);
    expect(() => new MinaClient({ retryDelayMs: -1 })).toThrow(RangeError);
    expect(() => new MinaClient({ timeoutMs: 0 })).toThrow(RangeError);
  });

  it('returns sync status', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ data: { syncStatus: 'SYNCED' } }),
    ) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    expect(await client.getSyncStatus()).toBe('SYNCED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('decodes account data with bigint balances', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        data: {
          account: {
            publicKey: 'B62qpub',
            nonce: '7',
            delegate: 'B62qdel',
            tokenId: '1',
            balance: { total: '1500000000', liquid: '1500000000', locked: null },
          },
        },
      }),
    ) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const account = await client.getAccount('B62qpub');
    expect(account.nonce).toBe(7);
    expect(account.balance.total.toString()).toBe('1.500000000');
    expect(account.balance.locked).toBeUndefined();
  });

  it('throws AccountNotFoundError when account is null', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ data: { account: null } }),
    ) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.getAccount('B62qnope')).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('surfaces GraphQL errors without retrying', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ errors: [{ message: 'bad input' }] }),
    ) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 3 });
    await expect(client.getSyncStatus()).rejects.toBeInstanceOf(GraphQLError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries transport failures up to the configured limit', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 3 });
    await expect(client.getSyncStatus()).rejects.toBeInstanceOf(DaemonConnectionError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('sends payment with nanomina-encoded input', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { input: Record<string, unknown> };
      };
      expect(body.variables.input).toMatchObject({
        from: 'B62qfrom',
        to: 'B62qto',
        amount: '1500000000',
        fee: '10000000',
        memo: 'hi',
      });
      return mockResponse({
        data: {
          sendPayment: { payment: { id: 'id-1', hash: '5J...', nonce: '42' } },
        },
      });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const result = await client.sendPayment({
      sender: 'B62qfrom',
      receiver: 'B62qto',
      amount: Currency.fromMina('1.5'),
      fee: Currency.fromMina('0.01'),
      memo: 'hi',
    });
    expect(result).toEqual({ id: 'id-1', hash: '5J...', nonce: 42 });
  });

  it('passes nullable input for setSnarkWorker when no key supplied', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as { variables: { input: unknown } };
      expect(body.variables.input).toBeNull();
      return mockResponse({ data: { setSnarkWorker: { lastSnarkWorker: 'B62qprev' } } });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    expect(await client.setSnarkWorker()).toBe('B62qprev');
  });

  it('sendPayment threads an explicit null signature for daemon-side signing', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { input: Record<string, unknown>; signature: unknown };
      };
      // Required: the mutation declares $signature, so omitting the variable
      // would trip the daemon's "Missing variable" error. We pass null.
      expect(body.variables).toHaveProperty('signature');
      expect(body.variables.signature).toBeNull();
      return mockResponse({
        data: { sendPayment: { payment: { id: 'p', hash: 'h', nonce: '1' } } },
      });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await client.sendPayment({
      sender: 'B62qfrom',
      receiver: 'B62qto',
      amount: Currency.fromNanomina('1000000000'),
      fee: Currency.fromNanomina('10000000'),
    });
  });

  it('sendPayment forwards a caller-supplied signature unchanged', async () => {
    const sig = { field: '0xfield', scalar: '0xscalar' };
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { signature: unknown };
      };
      expect(body.variables.signature).toEqual(sig);
      return mockResponse({
        data: { sendPayment: { payment: { id: 'p', hash: 'h', nonce: '1' } } },
      });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await client.sendPayment({
      sender: 'B62qfrom',
      receiver: 'B62qto',
      amount: Currency.fromNanomina('1'),
      fee: Currency.fromNanomina('1'),
      signature: sig,
    });
  });

  it('sendDelegation threads signature: null by default', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { signature: unknown };
      };
      expect(body.variables.signature).toBeNull();
      return mockResponse({
        data: { sendDelegation: { delegation: { id: 'd', hash: 'h', nonce: '7' } } },
      });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await client.sendDelegation({
      sender: 'B62qfrom',
      delegateTo: 'B62qto',
      fee: Currency.fromNanomina('1'),
    });
  });

  it('getBlock requires exactly one of stateHash or height', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ data: { block: null } }),
    ) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.getBlock({})).rejects.toThrow(/exactly one/);
    await expect(client.getBlock({ stateHash: '3NK', height: 100 })).rejects.toThrow(/exactly one/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('getBlock by height returns a flattened block', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { stateHash: unknown; height: unknown };
      };
      expect(body.variables).toEqual({ stateHash: null, height: 1281 });
      return mockResponse({
        data: {
          block: {
            stateHash: '3NKhash',
            protocolState: {
              previousStateHash: '3NKprev',
              consensusState: {
                blockHeight: '1281',
                epoch: '2',
                slot: '5',
                slotSinceGenesis: '500',
                blockCreator: 'B62qcreator',
              },
              blockchainState: {
                date: '1',
                utcDate: '2',
                snarkedLedgerHash: 'jx1',
                stagedLedgerHash: 'jx2',
              },
            },
            transactions: {
              coinbase: '720000000000',
              coinbaseReceiverAccount: { publicKey: 'B62qcb' },
              feeTransfer: [{ recipient: 'B62qft', fee: '100000', type: 'Fee_transfer' }],
              userCommands: [
                {
                  id: 'id1',
                  hash: '5J1',
                  kind: 'PAYMENT',
                  nonce: '0',
                  source: { publicKey: 'B62qa' },
                  receiver: { publicKey: 'B62qb' },
                  amount: '1',
                  fee: '1',
                  memo: 'hi',
                  failureReason: null,
                },
              ],
            },
          },
        },
      });
    }) as unknown as typeof fetch;

    const block = await makeClient(fetchImpl).getBlock({ height: 1281 });
    expect(block.blockHeight).toBe(1281);
    expect(block.coinbaseReceiver).toBe('B62qcb');
    expect(block.feeTransfers).toHaveLength(1);
    expect(block.userCommands[0]).toMatchObject({
      hash: '5J1',
      source: 'B62qa',
      receiver: 'B62qb',
    });
  });

  it('getBlock throws when daemon returns null', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ data: { block: null } }),
    ) as unknown as typeof fetch;
    await expect(makeClient(fetchImpl).getBlock({ height: 1 })).rejects.toThrow(/block not found/);
  });

  it('getTransactionStatus requires exactly one id and forwards the chosen one', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = JSON.parse(init?.body as string) as {
        variables: { payment: unknown; zkappTransaction: unknown };
      };
      expect(body.variables).toEqual({ payment: 'pay1', zkappTransaction: null });
      return mockResponse({ data: { transactionStatus: 'INCLUDED' } });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    expect(await client.getTransactionStatus({ payment: 'pay1' })).toBe('INCLUDED');
    await expect(client.getTransactionStatus({})).rejects.toThrow(/exactly one/);
  });

  it('getGenesisConstants returns the raw daemon shape', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        data: {
          genesisConstants: {
            genesisTimestamp: '2024-01-01T00:00:00Z',
            coinbase: '720000000000',
            accountCreationFee: '1000000000',
          },
        },
      }),
    ) as unknown as typeof fetch;
    const gc = await makeClient(fetchImpl).getGenesisConstants();
    expect(gc.coinbase).toBe('720000000000');
  });

  it('getTrackedAccounts flattens balance.total and tolerates null', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        data: {
          trackedAccounts: [
            { publicKey: 'B62q1', balance: { total: '1550000000000' } },
            { publicKey: 'B62q2', balance: { total: '0' } },
          ],
        },
      }),
    ) as unknown as typeof fetch;
    const accounts = await makeClient(fetchImpl).getTrackedAccounts();
    expect(accounts).toEqual([
      { publicKey: 'B62q1', balance: '1550000000000' },
      { publicKey: 'B62q2', balance: '0' },
    ]);

    const empty = vi.fn(async () =>
      mockResponse({ data: { trackedAccounts: null } }),
    ) as unknown as typeof fetch;
    expect(await makeClient(empty).getTrackedAccounts()).toEqual([]);
  });
});
