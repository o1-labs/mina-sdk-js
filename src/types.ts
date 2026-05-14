import type { Currency } from './currency.js';

export interface AccountBalance {
  total: Currency;
  liquid?: Currency;
  locked?: Currency;
}

export interface AccountData {
  publicKey: string;
  nonce: number;
  delegate: string;
  tokenId: string;
  balance: AccountBalance;
}

export interface PeerInfo {
  peerId: string;
  host: string;
  port: number;
}

export interface DaemonStatus {
  syncStatus: string;
  blockchainLength?: number;
  highestBlockLengthReceived?: number;
  uptimeSecs?: number;
  stateHash: string;
  commitId: string;
  peers: PeerInfo[];
}

export interface BlockInfo {
  stateHash: string;
  height: number;
  globalSlotSinceHardFork: number;
  globalSlotSinceGenesis: number;
  creatorPublicKey: string;
  commandTransactionCount: number;
}

export interface PooledUserCommand {
  id: string;
  hash: string;
  kind: string;
  nonce: string;
  amount: string;
  fee: string;
  from: string;
  to: string;
}

export interface SendPaymentResult {
  id: string;
  hash: string;
  nonce: number;
}

export interface SendDelegationResult {
  id: string;
  hash: string;
  nonce: number;
}

/**
 * Pre-computed signature for a daemon mutation. Produced by `mina-signer`'s
 * `client.signPayment` / `signStakeDelegation` — see the mina-signer README.
 * Pass to `sendPayment` / `sendDelegation` to submit a client-side-signed
 * transaction. Omit the field entirely (or pass `null`) to let the daemon
 * sign with its own wallet keys (tutorial / lightnet mode).
 */
export interface SignatureInput {
  field: string;
  scalar: string;
}

export interface SendPaymentParams {
  sender: string;
  receiver: string;
  amount: Currency;
  fee: Currency;
  memo?: string;
  nonce?: number;
  signature?: SignatureInput | null;
}

export interface SendDelegationParams {
  sender: string;
  delegateTo: string;
  fee: Currency;
  memo?: string;
  nonce?: number;
  signature?: SignatureInput | null;
}

export interface BlockArgs {
  /** State hash (3N…). Pass exactly one of `stateHash` or `height`. */
  stateHash?: string;
  /** Block height. Pass exactly one of `stateHash` or `height`. */
  height?: number;
}

export interface BlockTransaction {
  id: string;
  hash: string;
  kind: string;
  nonce: string;
  source: string;
  receiver: string;
  amount: string;
  fee: string;
  memo: string;
  failureReason: string | null;
}

export interface FeeTransfer {
  recipient: string;
  fee: string;
  type: string;
}

export interface Block {
  stateHash: string;
  previousStateHash: string;
  blockHeight: number;
  epoch: number;
  slot: number;
  slotSinceGenesis: number;
  blockCreator: string;
  date: string;
  utcDate: string;
  snarkedLedgerHash: string;
  stagedLedgerHash: string;
  coinbase: string;
  coinbaseReceiver: string | null;
  feeTransfers: FeeTransfer[];
  userCommands: BlockTransaction[];
}

export interface TransactionStatusArgs {
  /** Payment id (returned by `sendPayment`). */
  payment?: string;
  /** zkApp transaction id. */
  zkappTransaction?: string;
}

/**
 * Daemon-reported status of a submitted transaction.
 * - `PENDING`  — known to the mempool, not yet included
 * - `INCLUDED` — landed in a block (canonical or not)
 * - `UNKNOWN`  — the daemon doesn't know about this id
 */
export type TransactionStatus = 'PENDING' | 'INCLUDED' | 'UNKNOWN';

export interface GenesisConstants {
  /** ISO-8601 timestamp the chain considers t=0. */
  genesisTimestamp: string;
  /** Coinbase reward as a nanomina decimal string. */
  coinbase: string;
  /** Account-creation fee as a nanomina decimal string. */
  accountCreationFee: string;
}

export interface TrackedAccount {
  publicKey: string;
  /** Total balance as a nanomina decimal string. */
  balance: string;
}
