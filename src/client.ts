import { Currency } from './currency.js';
import { AccountNotFoundError, DaemonConnectionError, GraphQLError } from './errors.js';
import type { GraphQLErrorEntry } from './errors.js';
import {
  MUTATION_SEND_DELEGATION,
  MUTATION_SEND_PAYMENT,
  MUTATION_SET_SNARK_WORKER,
  MUTATION_SET_SNARK_WORK_FEE,
  QUERY_ACCOUNT,
  QUERY_ACCOUNT_WITH_TOKEN,
  QUERY_BEST_CHAIN,
  QUERY_BLOCK,
  QUERY_DAEMON_STATUS,
  QUERY_GENESIS_CONSTANTS,
  QUERY_NETWORK_ID,
  QUERY_PEERS,
  QUERY_POOLED_USER_COMMANDS,
  QUERY_POOLED_USER_COMMANDS_ALL,
  QUERY_SYNC_STATUS,
  QUERY_TRACKED_ACCOUNTS,
  QUERY_TRANSACTION_STATUS,
} from './queries.js';
import type {
  AccountData,
  AccountPermissions,
  AccountTiming,
  AddrsAndPorts,
  Block,
  BlockArgs,
  BlockInfo,
  BlockTransaction,
  DaemonStatus,
  FeeTransfer,
  GenesisConstants,
  PeerInfo,
  PooledUserCommand,
  SendDelegationParams,
  SendDelegationResult,
  SendPaymentParams,
  SendPaymentResult,
  SubmittedCommand,
  TrackedAccount,
  TransactionStatus,
  TransactionStatusArgs,
} from './types.js';

export const DEFAULT_GRAPHQL_URI = 'http://127.0.0.1:3085/graphql';

export interface ClientConfig {
  graphqlUri?: string;
  /** Number of attempts for failed requests. Must be >= 1. Default 3. */
  retries?: number;
  /** Delay between retries in milliseconds. Default 5000. */
  retryDelayMs?: number;
  /** HTTP request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Optional logger; defaults to `console`. Pass `null` to silence. */
  logger?: Pick<Console, 'log' | 'warn'> | null;
}

type Variables = Record<string, unknown>;

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorEntry[];
}

export class MinaClient {
  readonly graphqlUri: string;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'log' | 'warn'> | null;

  constructor(config: ClientConfig = {}) {
    this.graphqlUri = config.graphqlUri ?? DEFAULT_GRAPHQL_URI;
    this.retries = config.retries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 5000;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.logger = config.logger === undefined ? console : config.logger;

    if (this.retries < 1) throw new RangeError('retries must be >= 1');
    if (this.retryDelayMs < 0) throw new RangeError('retryDelayMs must be >= 0');
    if (this.timeoutMs <= 0) throw new RangeError('timeoutMs must be > 0');
    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError(
        'No fetch implementation available. Use Node 18+ or pass `fetch` in ClientConfig.',
      );
    }
  }

  /**
   * Run a GraphQL operation against the daemon. Public so callers can issue
   * custom queries not covered by the typed helpers.
   */
  async executeQuery<T = unknown>(
    query: string,
    variables: Variables | undefined,
    queryName: string,
  ): Promise<T> {
    const body = JSON.stringify({ query, variables: variables ?? {} });
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      this.logger?.log(`GraphQL ${queryName} attempt ${attempt}/${this.retries}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(this.graphqlUri, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });
        const text = await response.text();
        let parsed: GraphQLResponse<T>;
        try {
          parsed = JSON.parse(text) as GraphQLResponse<T>;
        } catch (e) {
          throw new Error(`invalid JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }
        if (parsed.errors && parsed.errors.length > 0) {
          throw new GraphQLError(parsed.errors, queryName);
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        if (parsed.data === undefined) {
          throw new Error(`empty data in response for ${queryName}`);
        }
        return parsed.data;
      } catch (err) {
        // GraphQL errors are deterministic — don't retry.
        if (err instanceof GraphQLError) throw err;
        lastError = err;
        this.logger?.warn(
          `GraphQL ${queryName} error on attempt ${attempt}/${this.retries}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (attempt < this.retries) {
          await sleep(this.retryDelayMs);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new DaemonConnectionError(queryName, this.retries, lastError);
  }

  // -- Queries --

  async getSyncStatus(): Promise<string> {
    const data = await this.executeQuery<{ syncStatus: string }>(
      QUERY_SYNC_STATUS,
      undefined,
      'get_sync_status',
    );
    return data.syncStatus;
  }

  async getDaemonStatus(): Promise<DaemonStatus> {
    const data = await this.executeQuery<{
      daemonStatus: {
        syncStatus: string;
        blockchainLength: number | null;
        highestBlockLengthReceived: number | null;
        highestUnvalidatedBlockLengthReceived: number | null;
        uptimeSecs: number | null;
        stateHash: string;
        commitId: string;
        numAccounts: number | null;
        ledgerMerkleRoot: string | null;
        chainId: string | null;
        catchupStatus: string[] | null;
        blockProductionKeys: string[] | null;
        coinbaseReceiver: string | null;
        peers: Array<{ peerId: string; host: string; libp2pPort: number }> | null;
        addrsAndPorts: {
          externalIp: string;
          bindIp: string;
          clientPort: number;
          libp2pPort: number;
        } | null;
      };
    }>(QUERY_DAEMON_STATUS, undefined, 'get_daemon_status');
    const ds = data.daemonStatus;
    const status: DaemonStatus = {
      syncStatus: ds.syncStatus,
      stateHash: ds.stateHash,
      commitId: ds.commitId,
      peers: (ds.peers ?? []).map(
        (p): PeerInfo => ({ peerId: p.peerId, host: p.host, port: p.libp2pPort }),
      ),
    };
    if (ds.blockchainLength != null) status.blockchainLength = ds.blockchainLength;
    if (ds.highestBlockLengthReceived != null) {
      status.highestBlockLengthReceived = ds.highestBlockLengthReceived;
    }
    if (ds.uptimeSecs != null) status.uptimeSecs = ds.uptimeSecs;
    if (ds.numAccounts != null) status.numAccounts = ds.numAccounts;
    if (ds.highestUnvalidatedBlockLengthReceived != null) {
      status.highestUnvalidatedBlockLengthReceived = ds.highestUnvalidatedBlockLengthReceived;
    }
    if (ds.ledgerMerkleRoot != null) status.ledgerMerkleRoot = ds.ledgerMerkleRoot;
    if (ds.chainId != null) status.chainId = ds.chainId;
    if (ds.catchupStatus != null) status.catchupStatus = ds.catchupStatus;
    if (ds.blockProductionKeys != null) status.blockProductionKeys = ds.blockProductionKeys;
    if (ds.coinbaseReceiver != null) status.coinbaseReceiver = ds.coinbaseReceiver;
    if (ds.addrsAndPorts != null) {
      const addrs: AddrsAndPorts = {
        externalIp: ds.addrsAndPorts.externalIp,
        bindIp: ds.addrsAndPorts.bindIp,
        clientPort: ds.addrsAndPorts.clientPort,
        libp2pPort: ds.addrsAndPorts.libp2pPort,
      };
      status.addrsAndPorts = addrs;
    }
    return status;
  }

  async getNetworkId(): Promise<string> {
    const data = await this.executeQuery<{ networkID: string }>(
      QUERY_NETWORK_ID,
      undefined,
      'get_network_id',
    );
    return data.networkID;
  }

  async getAccount(publicKey: string, tokenId?: string): Promise<AccountData> {
    const query = tokenId ? QUERY_ACCOUNT_WITH_TOKEN : QUERY_ACCOUNT;
    const variables: Variables = tokenId ? { publicKey, token: tokenId } : { publicKey };
    const data = await this.executeQuery<{
      account: {
        publicKey: string;
        nonce: string | number;
        delegate: string;
        tokenId: string;
        tokenSymbol: string | null;
        votingFor: string | null;
        receiptChainHash: string | null;
        balance: {
          total: string;
          liquid: string | null;
          locked: string | null;
          blockHeight: number | string | null;
        };
        timing: AccountTiming | null;
        permissions: AccountPermissions | null;
        zkappState: string[] | null;
        provedState: boolean | null;
        zkappUri: string | null;
      } | null;
    }>(query, variables, 'get_account');

    if (!data.account) {
      throw new AccountNotFoundError(publicKey);
    }
    const acc = data.account;
    const total = Currency.fromGraphQL(acc.balance.total);
    const balance: AccountData['balance'] = { total };
    if (acc.balance.liquid) balance.liquid = Currency.fromGraphQL(acc.balance.liquid);
    if (acc.balance.locked) balance.locked = Currency.fromGraphQL(acc.balance.locked);
    if (acc.balance.blockHeight != null) {
      balance.blockHeight = Number(acc.balance.blockHeight);
    }
    const account: AccountData = {
      publicKey: acc.publicKey,
      nonce: Number(acc.nonce),
      delegate: acc.delegate,
      tokenId: acc.tokenId,
      balance,
    };
    if (acc.tokenSymbol != null) account.tokenSymbol = acc.tokenSymbol;
    if (acc.votingFor !== undefined) account.votingFor = acc.votingFor;
    if (acc.receiptChainHash !== undefined) account.receiptChainHash = acc.receiptChainHash;
    if (acc.timing !== undefined) account.timing = acc.timing;
    if (acc.permissions !== undefined) account.permissions = acc.permissions;
    if (acc.zkappState !== undefined) account.zkappState = acc.zkappState;
    if (acc.provedState !== undefined) account.provedState = acc.provedState;
    if (acc.zkappUri !== undefined) account.zkappUri = acc.zkappUri;
    return account;
  }

  async getBestChain(maxLength?: number): Promise<BlockInfo[]> {
    const variables: Variables | undefined = maxLength && maxLength > 0 ? { maxLength } : undefined;
    const data = await this.executeQuery<{
      bestChain: Array<{
        stateHash: string;
        commandTransactionCount: number;
        creatorAccount: { publicKey: string | null };
        protocolState: {
          previousStateHash: string;
          consensusState: {
            blockHeight: string;
            epoch: string | number;
            slot: string;
            slotSinceGenesis: string;
            blockCreator: string;
            // The Mina daemon spells this field "coinbaseReceiever" (sic).
            coinbaseReceiever: string | null;
            stakingEpochData: { epochLength: string | number } | null;
          };
          blockchainState: {
            date: string;
            utcDate: string;
            snarkedLedgerHash: string;
            stagedLedgerHash: string;
          };
        };
        transactions: {
          userCommands: Array<{
            id: string;
            hash: string;
            kind: string;
            nonce: string | number;
            source: { publicKey: string };
            receiver: { publicKey: string };
            amount: string;
            fee: string;
            memo: string;
            failureReason: string | null;
          }>;
        };
      }> | null;
    }>(QUERY_BEST_CHAIN, variables, 'get_best_chain');

    return (data.bestChain ?? []).map((b): BlockInfo => {
      const cs = b.protocolState.consensusState;
      const bs = b.protocolState.blockchainState;
      const userCommands: BlockTransaction[] = b.transactions.userCommands.map((c) => ({
        id: c.id,
        hash: c.hash,
        kind: c.kind,
        nonce: String(c.nonce),
        source: c.source.publicKey,
        receiver: c.receiver.publicKey,
        amount: c.amount,
        fee: c.fee,
        memo: c.memo,
        failureReason: c.failureReason,
      }));
      const info: BlockInfo = {
        stateHash: b.stateHash,
        height: Number(cs.blockHeight),
        globalSlotSinceHardFork: Number(cs.slot),
        globalSlotSinceGenesis: Number(cs.slotSinceGenesis),
        creatorPublicKey: b.creatorAccount.publicKey ?? 'unknown',
        commandTransactionCount: b.commandTransactionCount,
        epoch: Number(cs.epoch),
        previousStateHash: b.protocolState.previousStateHash,
        blockCreator: cs.blockCreator,
        date: bs.date,
        utcDate: bs.utcDate,
        snarkedLedgerHash: bs.snarkedLedgerHash,
        stagedLedgerHash: bs.stagedLedgerHash,
        userCommands,
      };
      if (cs.coinbaseReceiever != null) info.coinbaseReceiver = cs.coinbaseReceiever;
      if (cs.stakingEpochData) {
        info.stakingEpochData = { epochLength: Number(cs.stakingEpochData.epochLength) };
      }
      return info;
    });
  }

  async getPeers(): Promise<PeerInfo[]> {
    const data = await this.executeQuery<{
      getPeers: Array<{ peerId: string; host: string; libp2pPort: number }>;
    }>(QUERY_PEERS, undefined, 'get_peers');
    return data.getPeers.map((p) => ({ peerId: p.peerId, host: p.host, port: p.libp2pPort }));
  }

  async getPooledUserCommands(publicKey?: string): Promise<PooledUserCommand[]> {
    const query = publicKey ? QUERY_POOLED_USER_COMMANDS : QUERY_POOLED_USER_COMMANDS_ALL;
    const variables: Variables | undefined = publicKey ? { publicKey } : undefined;
    const data = await this.executeQuery<{
      pooledUserCommands: Array<{
        id: string;
        hash: string;
        kind: string;
        nonce: string | number;
        amount: string;
        fee: string;
        from: string;
        to: string;
        source: { publicKey: string } | null;
        receiver: { publicKey: string } | null;
        memo: string | null;
        failureReason: string | null;
      }> | null;
    }>(query, variables, 'get_pooled_user_commands');

    return (data.pooledUserCommands ?? []).map((c) => {
      const cmd: PooledUserCommand = {
        id: c.id,
        hash: c.hash,
        kind: c.kind,
        nonce: String(c.nonce),
        amount: c.amount,
        fee: c.fee,
        from: c.from,
        to: c.to,
      };
      if (c.source?.publicKey) cmd.source = c.source.publicKey;
      if (c.receiver?.publicKey) cmd.receiver = c.receiver.publicKey;
      if (c.memo != null) cmd.memo = c.memo;
      if (c.failureReason !== undefined) cmd.failureReason = c.failureReason;
      return cmd;
    });
  }

  // -- Mutations --

  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    const input: Record<string, unknown> = {
      from: params.sender,
      to: params.receiver,
      amount: params.amount.toNanominaString(),
      fee: params.fee.toNanominaString(),
    };
    if (params.memo) input.memo = params.memo;
    if (params.nonce !== undefined) input.nonce = String(params.nonce);

    // The mutation declares $signature, so callers that want daemon-side
    // signing must pass an explicit null — omitting the variable triggers
    // the daemon's "Missing variable `signature`" error.
    const data = await this.executeQuery<{
      sendPayment: { payment: SubmittedCommandRaw };
    }>(MUTATION_SEND_PAYMENT, { input, signature: params.signature ?? null }, 'send_payment');
    return mapSubmittedCommand(data.sendPayment.payment);
  }

  async sendDelegation(params: SendDelegationParams): Promise<SendDelegationResult> {
    const input: Record<string, unknown> = {
      from: params.sender,
      to: params.delegateTo,
      fee: params.fee.toNanominaString(),
    };
    if (params.memo) input.memo = params.memo;
    if (params.nonce !== undefined) input.nonce = String(params.nonce);

    const data = await this.executeQuery<{
      sendDelegation: { delegation: SubmittedCommandRaw };
    }>(MUTATION_SEND_DELEGATION, { input, signature: params.signature ?? null }, 'send_delegation');
    return mapSubmittedCommand(data.sendDelegation.delegation);
  }

  /** Pass an empty string or omit `publicKey` to disable the SNARK worker. */
  async setSnarkWorker(publicKey?: string): Promise<string | null> {
    const data = await this.executeQuery<{
      setSnarkWorker: { lastSnarkWorker: string | null };
    }>(MUTATION_SET_SNARK_WORKER, { input: publicKey || null }, 'set_snark_worker');
    return data.setSnarkWorker.lastSnarkWorker;
  }

  async setSnarkWorkFee(fee: Currency): Promise<string> {
    const data = await this.executeQuery<{ setSnarkWorkFee: { lastFee: string } }>(
      MUTATION_SET_SNARK_WORK_FEE,
      { fee: fee.toNanominaString() },
      'set_snark_work_fee',
    );
    return data.setSnarkWorkFee.lastFee;
  }

  /**
   * Fetch a block by state hash or height. Pass exactly one — the daemon's
   * resolver rejects calls with both or neither.
   */
  async getBlock(args: BlockArgs): Promise<Block> {
    const hasHash = args.stateHash !== undefined;
    const hasHeight = args.height !== undefined;
    if (hasHash === hasHeight) {
      throw new RangeError('getBlock: pass exactly one of stateHash or height');
    }
    const variables: Variables = {
      stateHash: args.stateHash ?? null,
      height: args.height ?? null,
    };
    const data = await this.executeQuery<{
      block: {
        stateHash: string;
        protocolState: {
          previousStateHash: string;
          consensusState: {
            blockHeight: string | number;
            epoch: string | number;
            slot: string | number;
            slotSinceGenesis: string | number;
            blockCreator: string;
            // Mina daemon spells this "coinbaseReceiever" (sic).
            coinbaseReceiever: string | null;
          };
          blockchainState: {
            date: string;
            utcDate: string;
            snarkedLedgerHash: string;
            stagedLedgerHash: string;
          };
        };
        transactions: {
          coinbase: string;
          coinbaseReceiverAccount: { publicKey: string } | null;
          feeTransfer: Array<{ recipient: string; fee: string; type: string }>;
          userCommands: Array<{
            id: string;
            hash: string;
            kind: string;
            nonce: string | number;
            source: { publicKey: string };
            receiver: { publicKey: string };
            amount: string;
            fee: string;
            memo: string;
            failureReason: string | null;
          }>;
        };
      } | null;
    }>(QUERY_BLOCK, variables, 'get_block');

    if (!data.block) {
      throw new Error(
        `block not found (stateHash=${args.stateHash ?? 'null'}, height=${args.height ?? 'null'})`,
      );
    }
    const b = data.block;
    const cs = b.protocolState.consensusState;
    const bs = b.protocolState.blockchainState;
    const tx = b.transactions;
    const userCommands: BlockTransaction[] = tx.userCommands.map((c) => ({
      id: c.id,
      hash: c.hash,
      kind: c.kind,
      nonce: String(c.nonce),
      source: c.source.publicKey,
      receiver: c.receiver.publicKey,
      amount: c.amount,
      fee: c.fee,
      memo: c.memo,
      failureReason: c.failureReason,
    }));
    const feeTransfers: FeeTransfer[] = tx.feeTransfer.map((f) => ({
      recipient: f.recipient,
      fee: f.fee,
      type: f.type,
    }));
    const block: Block = {
      stateHash: b.stateHash,
      previousStateHash: b.protocolState.previousStateHash,
      blockHeight: Number(cs.blockHeight),
      epoch: Number(cs.epoch),
      slot: Number(cs.slot),
      slotSinceGenesis: Number(cs.slotSinceGenesis),
      blockCreator: cs.blockCreator,
      date: bs.date,
      utcDate: bs.utcDate,
      snarkedLedgerHash: bs.snarkedLedgerHash,
      stagedLedgerHash: bs.stagedLedgerHash,
      coinbase: tx.coinbase,
      coinbaseReceiver: tx.coinbaseReceiverAccount?.publicKey ?? null,
      feeTransfers,
      userCommands,
    };
    if (cs.coinbaseReceiever != null) block.coinbaseReceiverConsensus = cs.coinbaseReceiever;
    return block;
  }

  /**
   * Look up the daemon-reported status of a previously-submitted transaction.
   * Pass exactly one of `payment` or `zkappTransaction`.
   */
  async getTransactionStatus(args: TransactionStatusArgs): Promise<TransactionStatus> {
    const hasPayment = args.payment !== undefined;
    const hasZkapp = args.zkappTransaction !== undefined;
    if (hasPayment === hasZkapp) {
      throw new RangeError('getTransactionStatus: pass exactly one of payment or zkappTransaction');
    }
    const data = await this.executeQuery<{ transactionStatus: TransactionStatus }>(
      QUERY_TRANSACTION_STATUS,
      { payment: args.payment ?? null, zkappTransaction: args.zkappTransaction ?? null },
      'get_transaction_status',
    );
    return data.transactionStatus;
  }

  async getGenesisConstants(): Promise<GenesisConstants> {
    const data = await this.executeQuery<{ genesisConstants: GenesisConstants }>(
      QUERY_GENESIS_CONSTANTS,
      undefined,
      'get_genesis_constants',
    );
    return data.genesisConstants;
  }

  /**
   * Returns the public keys (and total balances) the daemon is tracking.
   * Lightnet / tutorial setups normally expose hundreds; public daemons
   * (devnet/mainnet) typically return an empty list.
   */
  async getTrackedAccounts(): Promise<TrackedAccount[]> {
    const data = await this.executeQuery<{
      trackedAccounts: Array<{ publicKey: string; balance: { total: string } }> | null;
    }>(QUERY_TRACKED_ACCOUNTS, undefined, 'get_tracked_accounts');
    return (data.trackedAccounts ?? []).map((a) => ({
      publicKey: a.publicKey,
      balance: a.balance.total,
    }));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SubmittedCommandRaw {
  id: string;
  hash: string;
  kind?: string;
  nonce: string | number;
  source?: { publicKey: string };
  receiver?: { publicKey: string };
  amount?: string;
  fee?: string;
  memo?: string;
}

function mapSubmittedCommand(p: SubmittedCommandRaw): SubmittedCommand {
  const out: SubmittedCommand = {
    id: p.id,
    hash: p.hash,
    nonce: Number(p.nonce),
  };
  if (p.kind != null) out.kind = p.kind;
  if (p.source?.publicKey) out.source = p.source.publicKey;
  if (p.receiver?.publicKey) out.receiver = p.receiver.publicKey;
  if (p.amount != null) out.amount = p.amount;
  if (p.fee != null) out.fee = p.fee;
  if (p.memo != null) out.memo = p.memo;
  return out;
}
