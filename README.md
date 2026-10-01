# Mina JavaScript SDK

[![CI](https://github.com/o1-labs/mina-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/o1-labs/mina-sdk-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@o1-labs/mina-sdk.svg)](https://www.npmjs.com/package/@o1-labs/mina-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

TypeScript/JavaScript SDK for interacting with [Mina Protocol](https://minaprotocol.com) nodes via GraphQL. Companion to [`mina-sdk-python`](https://github.com/MinaProtocol/mina-sdk-python), [`mina-sdk-go`](https://github.com/MinaProtocol/mina-sdk-go), and [`mina-sdk-rust`](https://github.com/MinaProtocol/mina-sdk-rust).

## Features

- **Daemon GraphQL client** — query node status, accounts, blocks; send payments and delegations
- **Trustless verification** — verify a block's SNARK proof in-process (optional `mina-verify-wasm` backend)
- Typed response objects with a `Currency` type backed by `bigint`
- Automatic retry with configurable backoff
- Public `executeQuery()` for custom GraphQL queries
- Ships ESM + CJS; works on Node 18+

## Installation

```bash
npm install @o1-labs/mina-sdk
```

## Quick Start

```ts
import { Currency, MinaClient } from '@o1-labs/mina-sdk';

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
import { MinaClient } from '@o1-labs/mina-sdk';

const client = new MinaClient({
  graphqlUri: 'http://127.0.0.1:3085/graphql', // default
  retries: 3,                                   // must be >= 1
  retryDelayMs: 5000,                           // delay between retries
  timeoutMs: 30_000,                            // per-request HTTP timeout
});
```

Constructor options are validated eagerly — invalid values throw `RangeError` at construction time.

## API Reference

The Mina SDKs have the same API, defined in
[mina-sdk-spec](https://github.com/o1-labs/mina-sdk-spec). `spec/` is a copy
of it at the tag in `spec/VERSION`. `tests/spec.test.ts` checks that this
SDK's queries, including the ITN queries, are the specification's documents,
and CI checks that `spec/` is the tag's copy.

### Queries

| Method | Returns | Description |
|--------|---------|-------------|
| `getSyncStatus()` | `string` | Node sync status (SYNCED, BOOTSTRAP, etc.) |
| `getDaemonStatus()` | `DaemonStatus` | Daemon status: chain length, peers, addresses, block production keys |
| `getDaemonMetrics()` | `DaemonMetrics` | Transaction and snark pool metrics, block production delay |
| `getNetworkId()` | `string` | Network identifier |
| `getAccount(publicKey, tokenId?)` | `AccountData` | Balance, nonce, delegate, timing, permissions, zkApp state |
| `getBestChain(maxLength?)` | `BlockInfo[]` | Recent blocks from the best chain |
| `getGenesisBlock()` | `BlockInfo` | The genesis block |
| `getBlock({ stateHash } \| { height })` | `Block` | One block, by state hash or height |
| `getPeers()` | `PeerInfo[]` | Connected peers |
| `getPooledUserCommands(publicKey?)` | `PooledUserCommand[]` | Pending payments and delegations |
| `getPooledZkappCommands(publicKey?)` | `ZkappCommandResult[]` | Pending zkApp commands |
| `getTransactionStatus({ payment } \| { zkappTransaction })` | `TransactionStatus` | `PENDING`, `INCLUDED` or `UNKNOWN` |
| `getGenesisConstants()` | `GenesisConstants` | Genesis timestamp, coinbase, account creation fee |
| `getTrackedAccounts()` | `TrackedAccount[]` | Accounts in the daemon's keystore |
| `getSnarkPool()` | `CompletedWork[]` | Completed snark work |
| `getForkConfig()` | `unknown` | The daemon's fork configuration (JSON) |
| `executeQuery(query, variables, name)` | `T` | Run a custom GraphQL query |

### Mutations

| Method | Returns | Description |
|--------|---------|-------------|
| `sendPayment(params)` | `SendPaymentResult` | Send a payment; `params.signature` for one made outside the daemon |
| `sendDelegation(params)` | `SendDelegationResult` | Delegate stake; `params.signature` likewise |
| `sendZkapp(command)` | `ZkappCommandResult` | Send a signed zkApp command (JSON) |
| `unlockAccount(publicKey, password)` | `string` | Unlock a keystore account so the daemon can sign with it |
| `setSnarkWorker(publicKey?)` | `string \| null` | Set/unset SNARK worker |
| `setSnarkWorkFee(fee)` | `string` | Set SNARK work fee |

Integration tests of the daemon client: set `MINA_GRAPHQL_URI` and run
`npm run test:integration`.

### Currency

```ts
import { Currency } from '@o1-labs/mina-sdk';

const a = Currency.fromMina(10);           // 10 MINA
const b = Currency.fromMina('1.5');        // 1.5 MINA
const c = Currency.fromNanomina(1_000_000_000n); // 1 MINA

console.log(a.add(b).toString()); // "11.500000000"
console.log(a.nanomina);          // 10000000000n
console.log(a.greaterThan(b));    // true
console.log(b.mul(3).toString()); // "4.500000000"
```

`Currency` is immutable and stored as a `bigint` of nanomina, so all arithmetic is exact.

## Trustless verification

Verify a Mina block's Pickles/kimchi SNARK proof in JS. A block that verifies attests its
**entire chain history** up to that block by Pickles recursion — so you can check chain
validity against an *untrusted* source (a node, an indexer, a GCS archive) without trusting
whoever supplied the bytes.

The proof verifier is a WebAssembly module, [`mina-verify-wasm`](https://github.com/MinaProtocol/mina-verify),
that is **not bundled** with this SDK (it is several MB) and is loaded lazily on first use.
Install it to enable verification:

```bash
npm install mina-verify-wasm
```

```ts
import { verifyPrecomputedBlock, checkBlockClaims } from '@o1-labs/mina-sdk';

// A "precomputed block" is the JSON a daemon publishes to GCS / the archive. (A daemon's
// GraphQL `protocolState` is a lossy projection and is NOT sufficient to verify a proof.)
const facts = verifyPrecomputedBlock(precomputedJson, { network: 'devnet' });
// -> { height, stateHash, previousStateHash, stagedLedgerHash }   (all proof-backed)

// Endpoint-honesty check: does an untrusted source's claim match what the proof attests?
const { honest, mismatches } = checkBlockClaims(precomputedJson, {
  stateHash: claimedFromSomeEndpoint,
});
if (!honest) console.error('endpoint lied:', mismatches);
```

`verifyPrecomputedBlock` throws `VerificationError` if the proof does not verify (do not
ingest the block), or `VerificationBackendError` if `mina-verify-wasm` is not installed.
`compareToClaims(facts, claimed)` is the pure comparison if you already have facts.

> **Synchronous & blocking.** Verification is single-threaded and CPU-bound (~tens of
> seconds per block), and these calls hold the event loop while running. Fine for scripts
> and periodic/background checks; run it in a worker thread if the host must stay
> responsive. A threaded backend is planned.

## Errors

- `GraphQLError` — daemon returned an `errors` array (not retried)
- `DaemonConnectionError` — transport-level failure after `retries` attempts
- `AccountNotFoundError` — `getAccount` returned a `null` account
- `CurrencyParseError` — invalid input to a `Currency.from*` factory
- `CurrencyUnderflowError` — `Currency.sub` would go negative
- `VerificationError` — a block's SNARK proof did not verify (do not ingest)
- `VerificationBackendError` — the optional `mina-verify-wasm` backend is not installed
- `ItnUnauthorizedError`, `ItnSequencingError`, `ItnHttpError`, `InvalidItnKeyError` —
  the ITN client (`@o1-labs/mina-sdk/itn`)

## ITN server (`@o1-labs/mina-sdk/itn`)

A daemon started with `ITN_FEATURES=1`, `--itn-graphql-port` and `--itn-keys`
serves a second GraphQL API, which load testing tools use. `ItnClient` signs
each request with an ed25519 `ItnKey` whose public half must be in
`--itn-keys`, and handles the daemon's sequence numbers (a new `auth` after a
daemon restart, HTTP 412). It is a separate entry point and uses `node:crypto`.

```ts
import { Currency } from '@o1-labs/mina-sdk';
import { ItnClient, ItnKey } from '@o1-labs/mina-sdk/itn';

const key = ItnKey.fromBase64(seedBase64); // base64 32-byte ed25519 seed
console.log('--itn-keys', key.publicKeyBase64());

const itn = new ItnClient({ graphqlUri: 'http://127.0.0.1:3086/graphql', key });
const logs = await itn.internalLogs(0);
const handle = await itn.schedulePayments({
  durationMin: 10,
  tps: 0.5,
  memoPrefix: 'load',
  maxFee: Currency.fromMina('0.2'),
  minFee: Currency.fromMina('0.1'),
  amount: Currency.fromNanomina(1000),
  receiver: 'B62q...',
  senders: ['EK...'],
});
await itn.stopScheduledTransactions(handle);
```

| Method | GraphQL |
|---|---|
| `auth()` | `auth` (server UUID, sequence number, peer ID, block producer) |
| `slotsWon()` | `slotsWon` |
| `internalLogs(start)` / `flushInternalLogs(end)` | `internalLogs` / `flushInternalLogs` |
| `schedulePayments(details)` | `schedulePayments` |
| `scheduleZkappCommands(details)` | `scheduleZkappCommands` |
| `stopScheduledTransactions(handle)` | `stopScheduledTransactions` |
| `updateGating(update)` | `updateGating` |
| `stopDaemon({ delaySeconds, cleanConfig })` | `stopDaemon` |
| `setZkappCommandLimit(limit)` | `zkAppCommandLimit` |
| `executeQuery(query, vars, name)` | any document, sequenced and signed |

Requests of one client are sent one at a time, because the daemon accepts only
its exact next sequence number; every method takes `{ signal }` to cancel it.
A sequenced request is never repeated after a transport error, because the
daemon may already have run it. `lastAuth()` returns the latest handshake, for
a caller that keeps the node's peer ID. Errors: `ItnUnauthorizedError` (401),
`ItnSequencingError` (412 after a new auth), `InvalidItnKeyError`, and
`DaemonConnectionError` whose `cause` is an `ItnHttpError` with the status.

The ITN documents are those of `spec/itn-operations.graphql`, which
mina-sdk-spec validates against the daemon's ITN schema. The Rust (`mina_sdk::itn`) and Go (`mina-sdk-go/itn`) SDKs have the same
client. Integration tests: set `MINA_ITN_URI` and `MINA_ITN_KEY` and run
`npm run test:integration`.

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
