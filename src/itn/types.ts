import type { Currency } from '../currency.js';

/** Result of the `auth` query. */
export interface ItnAuth {
  /** UUID of the ITN GraphQL server; it is new after each daemon restart. */
  serverUuid: string;
  /** The number the next sequenced request of this key must carry. */
  signerSequenceNumber: number;
  /** The node's libp2p port. */
  libp2pPort: number;
  /** The node's libp2p peer ID, if the daemon sent one. */
  peerId: string | null;
  /** Whether the node produces blocks. */
  isBlockProducer: boolean;
}

/** One entry of the daemon's internal log (`internalLogs`). */
export interface ItnLog {
  /** The log ID; IDs increase. */
  id: number;
  timestamp: string;
  message: string;
  /** Metadata as (item, value) pairs; the values are arbitrary JSON. */
  metadata: Array<{ item: string; value: unknown }>;
  /** The process that sent the log if it is not the daemon (prover or verifier). */
  process: string | null;
}

/** Input of `schedulePayments`. */
export interface PaymentsDetails {
  /** Length of the scheduler run, in minutes. */
  durationMin: number;
  /** Frequency of transactions, per second. */
  tps: number;
  /** Memo, up to 32 characters. */
  memoPrefix: string;
  maxFee: Currency;
  minFee: Currency;
  /** Amount of each payment. */
  amount: Currency;
  /** Public key of the receiver of the payments. */
  receiver: string;
  /** Base58 private keys of the accounts to send from. */
  senders: string[];
}

/** Input of `scheduleZkappCommands`. */
export interface ZkappCommandsDetails {
  /**
   * Each generated zkApp transaction has `2 * maxAccountUpdates + 2` account
   * updates (including balancing and fee payer). Omitted: the daemon default.
   */
  maxAccountUpdates?: number;
  /** Generate max-cost zkApp commands. */
  maxCost: boolean;
  /** Size of the queue of recently used accounts. */
  accountQueueSize: number;
  /** Fee of the initial deployment of zkApp accounts. */
  deploymentFee: Currency;
  maxFee: Currency;
  minFee: Currency;
  /** Initial balance of the zkApp accounts deployed for the test. */
  initBalance: Currency;
  maxNewZkappBalance: Currency;
  minNewZkappBalance: Currency;
  maxBalanceChange: Currency;
  minBalanceChange: Currency;
  /** Disable the precondition in account updates. */
  noPrecondition: boolean;
  memoPrefix: string;
  /** Length of the scheduler run, in minutes. */
  durationMin: number;
  /** Frequency of transactions, per second. */
  tps: number;
  /** Number of zkApp accounts the scheduler creates during the test. */
  numNewAccounts: number;
  /** Number of zkApp accounts deployed at the start of the test. */
  numZkappsToDeploy: number;
  /** Base58 private keys of the fee payers, which also create the accounts. */
  feePayers: string[];
  /**
   * Load a custom (non-default) owned token. Only an unreleased daemon branch
   * has this field; released daemons (for example 4.0.0) ignore it, because
   * ocaml-graphql-server does not check input fields that its schema does not
   * declare. It is sent only when set.
   */
  nonDefaultToken?: boolean;
}

/** A peer in a {@link GatingUpdate}. */
export interface NetworkPeer {
  /** IP address of the remote host. */
  host: string;
  libp2pPort: number;
  /** Base58 peer ID. */
  peerId: string;
}

/** Input of `updateGating`. */
export interface GatingUpdate {
  /** Peers to connect to. */
  addedPeers: NetworkPeer[];
  /** Reset the added peers, including the seeds, to an empty list. */
  cleanAddedPeers: boolean;
  /** Allow connections only from trusted peers. */
  isolate: boolean;
  /** Peers never allowed to connect, unless they are also trusted. */
  bannedPeers: NetworkPeer[];
  /** Peers always allowed to connect. */
  trustedPeers: NetworkPeer[];
}

/** Per-call options. */
export interface ItnCallOptions {
  /**
   * Cancels the call, also while it waits for an earlier request of the same
   * client (requests are sent one at a time).
   */
  signal?: AbortSignal;
}
