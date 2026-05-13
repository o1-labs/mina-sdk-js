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
});
