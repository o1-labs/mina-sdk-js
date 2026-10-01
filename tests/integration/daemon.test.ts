// Integration tests of the common API against a running daemon. They need
// MINA_GRAPHQL_URI (e.g. http://127.0.0.1:3085/graphql) and are skipped
// otherwise. None of them sends transactions.
import { describe, expect, it } from 'vitest';

import { GraphQLError, MinaClient } from '../../src/index.js';

const uri = process.env.MINA_GRAPHQL_URI ?? '';
const client = () =>
  new MinaClient({ graphqlUri: uri, retries: 3, retryDelayMs: 2000, logger: null });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!uri)('daemon', () => {
  it('daemon status and metrics', async () => {
    const status = await client().getDaemonStatus();
    expect(status.syncStatus).toBe('SYNCED');
    expect(status.chainId).toBeTruthy();
    const metrics = await client().getDaemonMetrics();
    expect(metrics.transactionPoolSize).toBeGreaterThanOrEqual(0);
  });

  it('genesis block and block lookups', async () => {
    const c = client();
    const genesis = await c.getGenesisBlock();
    expect(genesis.stateHash).not.toBe('');
    expect(genesis.stakingEpochData?.ledgerHash).toBeTruthy();

    // The daemon does not find the transition frontier's root by height, so
    // wait until the tip is above the root of a new chain (height 1).
    let [tip] = await c.getBestChain(1);
    for (let i = 0; i < 60 && (tip?.height ?? 0) <= 1; i++) {
      await sleep(5000);
      [tip] = await c.getBestChain(1);
    }
    if (!tip || tip.height <= 1) throw new Error('no block after the genesis block');
    const byHash = await c.getBlock({ stateHash: tip.stateHash });
    expect(byHash.blockHeight).toBe(tip.height);
    expect(byHash.previousStateHash).toBe(tip.previousStateHash);
    const byHeight = await c.getBlock({ height: tip.height });
    expect(byHeight.stateHash).toBe(tip.stateHash);
  }, 330_000);

  it('account, pools and constants', async () => {
    const c = client();
    const [tip] = await c.getBestChain(1);
    const account = await c.getAccount(tip?.creatorPublicKey ?? '');
    expect(account.balance.total.toNanominaString()).not.toBe('');
    expect((await c.getGenesisConstants()).genesisTimestamp).not.toBe('');
    await c.getPooledUserCommands();
    await c.getPooledZkappCommands();
    await c.getSnarkPool();
    await c.getTrackedAccounts();
  });

  it('transaction status of an ID that does not decode is a GraphQL error', async () => {
    await expect(client().getTransactionStatus({ payment: 'not-an-id' })).rejects.toBeInstanceOf(
      GraphQLError,
    );
  });
});
