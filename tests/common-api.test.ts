// Tests of the common API (spec/SPEC.md) against a mock daemon: the methods
// this SDK did not have, the new result fields, and the variables sent.
import { describe, expect, it } from 'vitest';
import { Currency, MinaClient } from '../src/index.js';

interface Recorded {
  query: string;
  variables: Record<string, unknown>;
}

/** A client whose daemon answers with `data` and records each request. */
function mockDaemon(data: unknown): { client: MinaClient; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string) as Recorded);
    return new Response(JSON.stringify({ data }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  const client = new MinaClient({
    fetch: fetchImpl,
    retries: 1,
    retryDelayMs: 0,
    timeoutMs: 1000,
    logger: null,
  });
  return { client, requests };
}

function blockJson() {
  const epoch = (seed: string, hash: string) => ({ seed, ledger: { hash } });
  return {
    stateHash: '3NKblock',
    commandTransactionCount: 1,
    creatorAccount: { publicKey: 'B62qcreator' },
    protocolState: {
      previousStateHash: '3NKprev',
      consensusState: {
        blockHeight: '12',
        epoch: '1',
        slot: '30',
        slotSinceGenesis: '40',
        blockCreator: 'B62qcreator',
        coinbaseReceiever: 'B62qcoinbase',
        stakingEpochData: { epochLength: '7', ...epoch('seedS', 'jxS') },
        nextEpochData: epoch('seedN', 'jxN'),
      },
      blockchainState: {
        date: '1700000000000',
        utcDate: '1700000000001',
        snarkedLedgerHash: 'jxSnarked',
        stagedLedgerHash: 'jxStaged',
      },
    },
    transactions: {
      coinbase: '720000000000',
      coinbaseReceiverAccount: { publicKey: 'B62qcoinbase' },
      feeTransfer: [{ recipient: 'B62qfee', fee: '5', type: 'Fee_transfer' }],
      userCommands: [
        {
          id: 'Cmd1',
          hash: '5Jhash',
          kind: 'PAYMENT',
          nonce: 3,
          source: { publicKey: 'B62qsrc' },
          receiver: { publicKey: 'B62qdst' },
          amount: '1000',
          fee: '10',
          memo: 'E4Y',
          failureReason: null,
        },
      ],
    },
  };
}

function zkappJson(validUntil: string | null, failureReason: unknown) {
  return {
    id: 'Zk',
    hash: '5Jz',
    zkappCommand: {
      memo: 'E4Y',
      feePayer: { body: { publicKey: 'B62qpayer', fee: '100', nonce: '7', validUntil } },
    },
    failureReason,
  };
}

describe('common API', () => {
  it('getBestChain sends a null maxLength and reads the common block selection', async () => {
    const { client, requests } = mockDaemon({ bestChain: [blockJson()] });
    const [b] = await client.getBestChain();
    expect(requests[0]?.query).toMatch(/^query BestChain\(/);
    expect(requests[0]?.variables).toEqual({ maxLength: null });
    expect(b).toMatchObject({
      height: 12,
      globalSlotSinceHardFork: 30,
      globalSlotSinceGenesis: 40,
      epoch: 1,
      previousStateHash: '3NKprev',
      coinbaseReceiver: 'B62qcoinbase',
      stakingEpochData: { epochLength: 7, seed: 'seedS', ledgerHash: 'jxS' },
      nextEpochData: { seed: 'seedN', ledgerHash: 'jxN' },
      coinbase: '720000000000',
      coinbaseReceiverAccount: 'B62qcoinbase',
      feeTransfers: [{ recipient: 'B62qfee', fee: '5', type: 'Fee_transfer' }],
    });
    expect(b?.userCommands?.[0]).toMatchObject({ id: 'Cmd1', nonce: '3', source: 'B62qsrc' });
  });

  it('getGenesisBlock and getBlock', async () => {
    const genesis = mockDaemon({ genesisBlock: blockJson() });
    expect((await genesis.client.getGenesisBlock()).stateHash).toBe('3NKblock');

    const { client, requests } = mockDaemon({ block: blockJson() });
    const block = await client.getBlock({ height: 12 });
    expect(requests[0]?.variables).toEqual({ stateHash: null, height: 12 });
    expect(block).toMatchObject({
      blockHeight: 12,
      creatorPublicKey: 'B62qcreator',
      commandTransactionCount: 1,
      coinbaseReceiver: 'B62qcoinbase',
      coinbaseReceiverConsensus: 'B62qcoinbase',
      stakingEpochData: { epochLength: 7, seed: 'seedS', ledgerHash: 'jxS' },
      nextEpochData: { seed: 'seedN', ledgerHash: 'jxN' },
    });
    await expect(client.getBlock({})).rejects.toThrow(RangeError);
  });

  it('getAccount sends a null token and drops an all-null timing', async () => {
    const { client, requests } = mockDaemon({
      account: {
        publicKey: 'B62qacc',
        nonce: '0',
        delegate: null,
        tokenId: 'wSHV',
        balance: { total: '1', liquid: null, locked: null, blockHeight: '3' },
        timing: {
          initialMinimumBalance: null,
          cliffTime: null,
          cliffAmount: null,
          vestingPeriod: null,
          vestingIncrement: null,
        },
      },
    });
    const account = await client.getAccount('B62qacc');
    expect(requests[0]?.variables).toEqual({ publicKey: 'B62qacc', token: null });
    expect(account.timing).toBeNull();
    expect(account.balance.blockHeight).toBe(3);

    await client.getAccount('B62qacc', 'wSHV');
    expect(requests[1]?.variables).toEqual({ publicKey: 'B62qacc', token: 'wSHV' });
  });

  it('getDaemonMetrics', async () => {
    const metrics = {
      blockProductionDelay: [1, 2],
      transactionPoolDiffReceived: 3,
      transactionPoolDiffBroadcasted: 4,
      transactionsAddedToPool: 5,
      transactionPoolSize: 6,
      snarkPoolDiffReceived: 7,
      snarkPoolDiffBroadcasted: 8,
      pendingSnarkWork: 9,
      snarkPoolSize: 10,
    };
    const { client } = mockDaemon({ daemonStatus: { metrics } });
    expect(await client.getDaemonMetrics()).toEqual(metrics);
  });

  it('pooled user and zkApp commands send a null public key', async () => {
    const users = mockDaemon({ pooledUserCommands: [] });
    await users.client.getPooledUserCommands();
    expect(users.requests[0]?.variables).toEqual({ publicKey: null });

    const { client, requests } = mockDaemon({
      pooledZkappCommands: [zkappJson(null, [{ index: '1', failures: ['Invalid_fee_excess'] }])],
    });
    const [z] = await client.getPooledZkappCommands('B62qpayer');
    expect(requests[0]?.variables).toEqual({ publicKey: 'B62qpayer' });
    expect(z?.feePayer.fee.equals(Currency.fromNanomina(100))).toBe(true);
    expect(z?.feePayer).toMatchObject({ publicKey: 'B62qpayer', nonce: 7, validUntil: null });
    expect(z?.failureReason).toEqual([{ index: 1, failures: ['Invalid_fee_excess'] }]);
  });

  it('getSnarkPool and getForkConfig', async () => {
    const pool = mockDaemon({ snarkPool: [{ fee: '10', prover: 'B62qp', workIds: [3, '4'] }] });
    const [w] = await pool.client.getSnarkPool();
    expect(w?.prover).toBe('B62qp');
    expect(w?.workIds).toEqual([3, 4]);
    expect(w?.fee.equals(Currency.fromNanomina(10))).toBe(true);

    const fork = mockDaemon({ fork_config: { proof: { fork: null } } });
    expect(await fork.client.getForkConfig()).toEqual({ proof: { fork: null } });
  });

  it('sendZkapp and unlockAccount', async () => {
    const zk = mockDaemon({ sendZkapp: { zkapp: zkappJson('99', null) } });
    const command = { feePayer: {}, accountUpdates: [], memo: '' };
    const z = await zk.client.sendZkapp(command);
    expect(zk.requests[0]?.variables).toEqual({ input: { zkappCommand: command } });
    expect(z.feePayer.validUntil).toBe(99);
    expect(z.failureReason).toBeNull();

    const unlock = mockDaemon({ unlockAccount: { publicKey: 'B62qacc' } });
    expect(await unlock.client.unlockAccount('B62qacc', 'pw')).toBe('B62qacc');
    expect(unlock.requests[0]?.variables).toEqual({
      input: { publicKey: 'B62qacc', password: 'pw' },
    });
  });

  it('sendPayment always sends the signature variable', async () => {
    const { client, requests } = mockDaemon({
      sendPayment: { payment: { id: 'Cmd', hash: '5J', nonce: '3' } },
    });
    const params = {
      sender: 'B62qa',
      receiver: 'B62qb',
      amount: Currency.fromNanomina(1000),
      fee: Currency.fromNanomina(10),
    };
    await client.sendPayment(params);
    expect(requests[0]?.variables).toHaveProperty('signature', null);
    await client.sendPayment({ ...params, signature: { field: '1', scalar: '2' } });
    expect(requests[1]?.variables.signature).toEqual({ field: '1', scalar: '2' });
  });
});
