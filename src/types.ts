import type { Currency } from './currency.js';

export interface AccountBalance {
  total: Currency;
  liquid?: Currency;
  locked?: Currency;
  /** Block height at which this balance snapshot was taken. */
  blockHeight?: number;
}

/** Vesting schedule attached to an account; absent for untimed accounts. */
export interface AccountTiming {
  initialMinimumBalance: string;
  cliffTime: string;
  cliffAmount: string;
  vestingPeriod: string;
  vestingIncrement: string;
}

/**
 * Per-action permissions on an account. Each entry names an auth predicate
 * the daemon enforces for that action (e.g. "signature", "proof", "either",
 * "none"). The full set is sparse on non-zkApp accounts.
 */
export interface AccountPermissions {
  editState?: string;
  send?: string;
  receive?: string;
  access?: string;
  setDelegate?: string;
  setPermissions?: string;
  setVerificationKey?: string;
  setZkappUri?: string;
  editActionState?: string;
  setTokenSymbol?: string;
  incrementNonce?: string;
  setVotingFor?: string;
  setTiming?: string;
}

export interface AccountData {
  publicKey: string;
  nonce: number;
  delegate: string;
  tokenId: string;
  balance: AccountBalance;
  /** Token symbol set on this account; empty string when unset. */
  tokenSymbol?: string;
  /** State hash the account is currently voting for; null when unset. */
  votingFor?: string | null;
  /** Vesting timing; null for untimed accounts. */
  timing?: AccountTiming | null;
  /** Receipt-chain commitment hash; null on untouched accounts. */
  receiptChainHash?: string | null;
  /** Per-action permission predicates. */
  permissions?: AccountPermissions | null;
  /** zkApp on-chain state slots; null for non-zkApp accounts. */
  zkappState?: string[] | null;
  /** True when the zkApp on-chain state has been proved by its current verification key. */
  provedState?: boolean | null;
  /** URI describing the zkApp; null for non-zkApp accounts. */
  zkappUri?: string | null;
}

export interface PeerInfo {
  peerId: string;
  host: string;
  port: number;
}

export interface AddrsAndPorts {
  externalIp: string;
  bindIp: string;
  clientPort: number;
  libp2pPort: number;
}

export interface DaemonStatus {
  syncStatus: string;
  blockchainLength?: number;
  highestBlockLengthReceived?: number;
  uptimeSecs?: number;
  stateHash: string;
  commitId: string;
  peers: PeerInfo[];
  /** Number of accounts the daemon has loaded; null when not yet available. */
  numAccounts?: number | null;
  /** Highest block length the daemon has *seen* (may be unvalidated). */
  highestUnvalidatedBlockLengthReceived?: number | null;
  /** Merkle root of the current staged ledger. */
  ledgerMerkleRoot?: string | null;
  /** Chain id the daemon is configured for; differentiates devnet/mainnet/etc. */
  chainId?: string | null;
  /** Last reported catch-up phase, if any. */
  catchupStatus?: string[] | null;
  /** Public keys the daemon is producing blocks for. */
  blockProductionKeys?: string[];
  /** Public key receiving coinbase rewards. */
  coinbaseReceiver?: string | null;
  /** Network endpoints the daemon is bound to. */
  addrsAndPorts?: AddrsAndPorts;
}

export interface StakingEpochData {
  epochLength: number;
}

export interface BlockInfo {
  stateHash: string;
  height: number;
  globalSlotSinceHardFork: number;
  globalSlotSinceGenesis: number;
  creatorPublicKey: string;
  commandTransactionCount: number;
  /** Epoch the block belongs to. */
  epoch?: number;
  /** State hash of the parent block. */
  previousStateHash?: string;
  /** Public key the daemon credited the block to. */
  blockCreator?: string;
  /**
   * Public key receiving coinbase for this block. Note the field is spelled
   * "coinbaseReceiever" in the Mina daemon (preserved typo); the SDK exposes
   * it under the corrected name.
   */
  coinbaseReceiver?: string;
  stakingEpochData?: StakingEpochData;
  /** Wall-clock timestamp the daemon assigned when packaging the block. */
  date?: string;
  utcDate?: string;
  snarkedLedgerHash?: string;
  stagedLedgerHash?: string;
  /** User commands included in this block (only populated by `getBestChain`). */
  userCommands?: BlockTransaction[];
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
  /** Sender account reference; same as `from` for token=1 commands. */
  source?: string;
  /** Receiver account reference; same as `to` for token=1 commands. */
  receiver?: string;
  memo?: string;
  failureReason?: string | null;
}

export interface SubmittedCommand {
  id: string;
  hash: string;
  nonce: number;
  /** "PAYMENT" / "STAKE_DELEGATION" / etc. */
  kind?: string;
  source?: string;
  receiver?: string;
  amount?: string;
  fee?: string;
  memo?: string;
}

export interface SendPaymentResult extends SubmittedCommand {}
export interface SendDelegationResult extends SubmittedCommand {}

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
  /**
   * Public key receiving coinbase for this block. Note the Mina daemon
   * exposes this field as "coinbaseReceiever" (preserved typo) on
   * `consensusState`; the SDK normalizes to the corrected spelling.
   */
  coinbaseReceiverConsensus?: string;
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
