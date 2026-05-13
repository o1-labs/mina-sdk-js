# Mina JavaScript SDK

[![CI](https://github.com/MinaProtocol/mina-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/MinaProtocol/mina-sdk-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mina-sdk.svg)](https://www.npmjs.com/package/mina-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

TypeScript/JavaScript SDK for interacting with [Mina Protocol](https://minaprotocol.com) nodes via GraphQL. Companion to [`mina-sdk-python`](https://github.com/MinaProtocol/mina-sdk-python), [`mina-sdk-go`](https://github.com/MinaProtocol/mina-sdk-go), and [`mina-sdk-rust`](https://github.com/MinaProtocol/mina-sdk-rust).

## Features

- **Daemon GraphQL client** — query node status, accounts, blocks; send payments and delegations
- Typed response objects with a `Currency` type backed by `bigint`
- Automatic retry with configurable backoff
- Public `executeQuery()` for custom GraphQL queries
- Ships ESM + CJS; works on Node 18+

## Installation

```bash
npm install mina-sdk
```

## Quick Start

```ts
import { Currency, MinaClient } from 'mina-sdk';

const client = new MinaClient();

console.log(await client.getSyncStatus()); // "SYNCED"

const account = await client.getAccount('B62q...');
console.log(`Balance: ${account.balance.total} MINA`);

const result = await client.sendPayment({
  sender: 'B62qsender...',
  receiver: 'B62qreceiver...',
  amount: Currency.fromMina('1.5'),
  fee: Currency.fromMina('0.01'),
});
console.log(`Tx hash: ${result.hash}`);
```

## Configuration

```ts
import { MinaClient } from 'mina-sdk';

const client = new MinaClient({
  graphqlUri: 'http://127.0.0.1:3085/graphql', // default
  retries: 3,                                   // must be >= 1
  retryDelayMs: 5000,                           // delay between retries
  timeoutMs: 30_000,                            // per-request HTTP timeout
});
```

Constructor options are validated eagerly — invalid values throw `RangeError` at construction time.

## API Reference

### Queries

| Method | Returns | Description |
|--------|---------|-------------|
| `getSyncStatus()` | `string` | Node sync status (SYNCED, BOOTSTRAP, etc.) |
| `getDaemonStatus()` | `DaemonStatus` | Comprehensive daemon status |
| `getNetworkId()` | `string` | Network identifier |
| `getAccount(publicKey, tokenId?)` | `AccountData` | Account balance, nonce, delegate |
| `getBestChain(maxLength?)` | `BlockInfo[]` | Recent blocks from the best chain |
| `getPeers()` | `PeerInfo[]` | Connected peers |
| `getPooledUserCommands(publicKey?)` | `PooledUserCommand[]` | Pending transactions |
| `executeQuery(query, variables, name)` | `T` | Run a custom GraphQL query |

### Mutations

| Method | Returns | Description |
|--------|---------|-------------|
| `sendPayment(params)` | `SendPaymentResult` | Send a payment |
| `sendDelegation(params)` | `SendDelegationResult` | Delegate stake |
| `setSnarkWorker(publicKey?)` | `string \| null` | Set/unset SNARK worker |
| `setSnarkWorkFee(fee)` | `string` | Set SNARK work fee |

### Currency

```ts
import { Currency } from 'mina-sdk';

const a = Currency.fromMina(10);           // 10 MINA
const b = Currency.fromMina('1.5');        // 1.5 MINA
const c = Currency.fromNanomina(1_000_000_000n); // 1 MINA

console.log(a.add(b).toString()); // "11.500000000"
console.log(a.nanomina);          // 10000000000n
console.log(a.greaterThan(b));    // true
console.log(b.mul(3).toString()); // "4.500000000"
```

`Currency` is immutable and stored as a `bigint` of nanomina, so all arithmetic is exact.

## Errors

- `GraphQLError` — daemon returned an `errors` array (not retried)
- `DaemonConnectionError` — transport-level failure after `retries` attempts
- `AccountNotFoundError` — `getAccount` returned a `null` account
- `CurrencyParseError` — invalid input to a `Currency.from*` factory
- `CurrencyUnderflowError` — `Currency.sub` would go negative

## Custom Queries

```ts
const data = await client.executeQuery<{ bestChain: Array<{ stateHash: string }> }>(
  `query { bestChain(maxLength: 1) { stateHash } }`,
  {},
  'best_chain_head',
);
console.log(data.bestChain[0].stateHash);
```

## License

Apache-2.0
