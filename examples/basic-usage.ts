import {
  AccountNotFoundError,
  Currency,
  DaemonConnectionError,
  GraphQLError,
  MinaClient,
} from 'mina-sdk';

async function main() {
  const client = new MinaClient();

  console.log('Sync status:', await client.getSyncStatus());

  const status = await client.getDaemonStatus();
  console.log('Blockchain length:', status.blockchainLength);
  console.log('Peers:', status.peers.length);
  console.log('Network:', await client.getNetworkId());

  try {
    const account = await client.getAccount('B62qrPN5Y5yq8kGE3FbVKbGTdTAJNdtNtS5vH1tH...');
    console.log('Balance:', account.balance.total.toString(), 'MINA');
    console.log('Nonce:', account.nonce);
  } catch (e) {
    if (e instanceof AccountNotFoundError) {
      console.log('Account not found:', e.publicKey);
    } else {
      throw e;
    }
  }

  const blocks = await client.getBestChain(5);
  for (const b of blocks) {
    console.log(
      `Block ${b.height}: ${b.stateHash.slice(0, 20)}... (${b.commandTransactionCount} txns)`,
    );
  }

  try {
    const result = await client.sendPayment({
      sender: 'B62qsender...',
      receiver: 'B62qreceiver...',
      amount: Currency.fromMina('1.5'),
      fee: Currency.fromMina('0.01'),
      memo: 'hello from SDK',
    });
    console.log('Payment sent. Hash:', result.hash, 'Nonce:', result.nonce);
  } catch (e) {
    if (e instanceof GraphQLError) {
      console.error('Payment failed:', e.message);
    } else {
      throw e;
    }
  }
}

async function connectToRemote() {
  const client = new MinaClient({
    graphqlUri: 'http://my-mina-node:3085/graphql',
    retries: 5,
    retryDelayMs: 10_000,
    timeoutMs: 60_000,
  });
  try {
    console.log('Remote node status:', await client.getSyncStatus());
  } catch (e) {
    if (e instanceof DaemonConnectionError) {
      console.error('Could not reach remote node:', e.message);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// Suppress unused warning in example scaffold.
void connectToRemote;
