import { DaemonConnectionError, GraphQLError } from '../errors.js';
import type { GraphQLErrorEntry } from '../errors.js';
import { ItnHttpError, ItnSequencingError, ItnUnauthorizedError } from './errors.js';
import type { ItnKey } from './key.js';
import {
  MUTATION_CREATE_ACCOUNTS,
  MUTATION_SCHEDULE_PAYMENTS_WITH_HANDLE,
  MUTATION_SCHEDULE_ZKAPP_COMMANDS_WITH_HANDLE,
  QUERY_COMMIT_ID,
  QUERY_SCHEDULED_TRANSACTIONS,
  MUTATION_FLUSH_INTERNAL_LOGS,
  MUTATION_SCHEDULE_PAYMENTS,
  MUTATION_SCHEDULE_ZKAPP_COMMANDS,
  MUTATION_STOP_DAEMON,
  MUTATION_STOP_SCHEDULED_TRANSACTIONS,
  MUTATION_UPDATE_GATING,
  MUTATION_ZKAPP_COMMAND_LIMIT,
  QUERY_AUTH,
  QUERY_INTERNAL_LOGS,
  QUERY_SLOTS_WON,
} from './queries.js';
import type {
  CreateAccountsDetails,
  CreatedAccounts,
  GatingUpdate,
  ItnAuth,
  ItnCallOptions,
  ItnLog,
  PaymentsDetails,
  ZkappCommandsDetails,
} from './types.js';

export interface ItnClientConfig {
  /** The ITN endpoint, for example `http://127.0.0.1:3086/graphql`. */
  graphqlUri: string;
  /** Key whose public half is in the daemon's `--itn-keys`. */
  key: ItnKey;
  /**
   * Attempts of the `auth` handshake. Must be >= 1. Default 3. Sequenced
   * requests are never repeated after a transport error.
   */
  retries?: number;
  /** Delay between auth attempts in milliseconds. Default 5000. */
  retryDelayMs?: number;
  /** HTTP request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Optional logger; defaults to `console`. Pass `null` to silence. */
  logger?: Pick<Console, 'log' | 'warn'> | null;
}

type Variables = Record<string, unknown>;

interface Session {
  uuid: string;
  seq: number;
}

/** No answer arrived (network error, timeout, abort, or an unreadable body). */
class TransportFailure {
  constructor(readonly cause: unknown) {}
}

/** Aborts when either signal does (AbortSignal.any needs Node 20.3). */
function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  for (const s of [a, b]) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

function nonNull<T>(list: T[] | undefined): T[] {
  return list ?? [];
}

/**
 * Client for one daemon's ITN GraphQL server.
 *
 * The daemon reads the `Authorization` header:
 *
 * - `Signature <pk> <sig>`: the signature covers the request body. Accepted
 *   for the `auth` query only; every other operation answers "Missing
 *   sequence information".
 * - `Signature <pk> <sig> ; Sequencing <uuid> <n>`: the signature covers the
 *   big-endian uint16 `n`, then the server UUID, then the body. `n` must be
 *   exactly the daemon's sequence number for this public key, which goes up by
 *   one (wrapping) after each accepted sequenced request and is shared by all
 *   clients that sign with the same key.
 *
 * A bad signature or an unknown key gives HTTP 401; a wrong UUID (the daemon
 * restarted) or sequence number gives HTTP 412.
 *
 * The client runs `auth` to learn the UUID and the sequence number, sends
 * sequenced requests one at a time, and on a 412 runs `auth` again and
 * repeats the request once. It never repeats a sequenced request after a
 * transport error, because the daemon may have run it. Share one client per
 * daemon: it holds the daemon's session.
 */
export class ItnClient {
  readonly graphqlUri: string;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly timeoutMs: number;
  private readonly key: ItnKey;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'log' | 'warn'> | null;
  private session: Session | null = null;
  private latestAuth: ItnAuth | null = null;
  /** Tail of the request queue; each request waits for the one before it. */
  private queue: Promise<void> = Promise.resolve();

  constructor(config: ItnClientConfig) {
    this.graphqlUri = config.graphqlUri;
    this.key = config.key;
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
        'No fetch implementation available. Use Node 18+ or pass `fetch` in ItnClientConfig.',
      );
    }
  }

  /** The base64 public key of the client's key, as it must appear in `--itn-keys`. */
  publicKeyBase64(): string {
    return this.key.publicKeyBase64();
  }

  /**
   * The answer of the latest `auth` handshake, or null before the first. The
   * client runs `auth` again by itself after a daemon restart, so a caller
   * that keeps the node's peer ID or libp2p port can refresh them from here.
   */
  lastAuth(): ItnAuth | null {
    return this.latestAuth;
  }

  // -- Transport --

  /** Run `task` after every earlier request of this client has finished. */
  private async exclusive<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let done!: () => void;
    this.queue = new Promise<void>((resolve) => (done = resolve));
    try {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const onAbort = () => reject(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        void previous.then(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
      });
      return await task();
    } finally {
      // A request that gave up while waiting still keeps the order: the
      // next one waits for the one before this.
      void previous.then(done);
    }
  }

  private async post(
    body: Uint8Array,
    authorization: string,
    signal: AbortSignal | undefined,
  ): Promise<{ status: number; text: string }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? anySignal(signal, timeout) : timeout;
    try {
      const response = await this.fetchImpl(this.graphqlUri, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization },
        body,
        signal: combined,
      });
      return { status: response.status, text: await response.text() };
    } catch (err) {
      throw new TransportFailure(err);
    }
  }

  private decode<T>(text: string, queryName: string): T {
    let parsed: { data?: T; errors?: GraphQLErrorEntry[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error(`${queryName}: invalid JSON response: ${text.slice(0, 200)}`);
    }
    if (parsed.errors && parsed.errors.length > 0) throw new GraphQLError(parsed.errors, queryName);
    if (parsed.data === undefined) throw new Error(`${queryName}: empty data in response`);
    return parsed.data;
  }

  /** Run `auth` with an unsequenced signature and store the session. */
  private async handshake(signal: AbortSignal | undefined): Promise<ItnAuth> {
    const name = 'itn_auth';
    const body = Buffer.from(JSON.stringify({ query: QUERY_AUTH }));
    const authorization = `Signature ${this.key.publicKeyBase64()} ${this.key.signBase64(body)}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const { status, text } = await this.post(body, authorization, signal);
        if (status === 401) throw new ItnUnauthorizedError(name);
        if (status >= 300) {
          lastError = new ItnHttpError(status, text);
        } else {
          const auth = parseAuth(this.decode<{ auth: unknown }>(text, name).auth);
          this.session = { uuid: auth.serverUuid, seq: auth.signerSequenceNumber };
          this.latestAuth = auth;
          return auth;
        }
      } catch (err) {
        if (!(err instanceof TransportFailure)) throw err;
        if (signal?.aborted) throw signal.reason;
        lastError = err.cause;
      }
      this.logger?.warn(`ITN auth attempt ${attempt}/${this.retries} failed: ${String(lastError)}`);
      if (attempt < this.retries) await new Promise((r) => setTimeout(r, this.retryDelayMs));
    }
    throw new DaemonConnectionError(name, this.retries, lastError);
  }

  /**
   * Send one sequenced, signed request and return its `data` field. Requests
   * of one client are sent one at a time, because the daemon accepts only its
   * exact next sequence number.
   */
  async executeQuery<T = unknown>(
    query: string,
    variables: Variables | undefined,
    queryName: string,
    options: ItnCallOptions = {},
  ): Promise<T> {
    const body = Buffer.from(JSON.stringify({ query, variables: variables ?? {} }));
    const { signal } = options;
    return this.exclusive(signal, async () => {
      // A second pass only follows a 412: the daemon restarted, or another
      // client with the same key used our sequence number.
      for (let pass = 1; pass <= 2; pass++) {
        if (!this.session) await this.handshake(signal);
        const { uuid, seq } = this.session!;
        const seqBytes = Buffer.alloc(2);
        seqBytes.writeUInt16BE(seq);
        const signature = this.key.signBase64(Buffer.concat([seqBytes, Buffer.from(uuid), body]));
        const authorization = `Signature ${this.key.publicKeyBase64()} ${signature} ; Sequencing ${uuid} ${seq}`;

        let status: number;
        let text: string;
        try {
          ({ status, text } = await this.post(body, authorization, signal));
        } catch (err) {
          // Unknown whether the daemon counted it: start over next time.
          this.session = null;
          if (signal?.aborted) throw signal.reason;
          throw new DaemonConnectionError(queryName, 1, (err as TransportFailure).cause);
        }
        if (status === 412) {
          this.logger?.warn(`ITN ${queryName}: stale session (412), running auth again`);
          this.session = null;
          continue;
        }
        if (status === 401) throw new ItnUnauthorizedError(queryName);
        if (status >= 300) {
          this.session = null;
          throw new DaemonConnectionError(queryName, 1, new ItnHttpError(status, text));
        }
        // The signature was accepted, so the daemon has moved to the next
        // number, whatever the GraphQL result is.
        this.session!.seq = (seq + 1) & 0xffff;
        return this.decode<T>(text, queryName);
      }
      throw new ItnSequencingError(queryName);
    });
  }

  // -- Operations --

  /**
   * Run the `auth` handshake and return the node's answer. Other methods run
   * it when needed, so calling it first is optional.
   */
  async auth(options: ItnCallOptions = {}): Promise<ItnAuth> {
    return this.exclusive(options.signal, () => this.handshake(options.signal));
  }

  /** Global slots the node's block producer keys won in the current epoch. */
  async slotsWon(options?: ItnCallOptions): Promise<number[]> {
    const data = await this.executeQuery<{ slotsWon: number[] }>(
      QUERY_SLOTS_WON,
      undefined,
      'itn_slots_won',
      options,
    );
    return data.slotsWon;
  }

  /** Internal logs with an ID of at least `startLogId`. */
  async internalLogs(startLogId: number, options?: ItnCallOptions): Promise<ItnLog[]> {
    const data = await this.executeQuery<{ internalLogs: ItnLog[] }>(
      QUERY_INTERNAL_LOGS,
      { startLogId },
      'itn_internal_logs',
      options,
    );
    return data.internalLogs;
  }

  /** Drop internal logs up to and including `endLogId`; returns the daemon's answer. */
  async flushInternalLogs(endLogId: number, options?: ItnCallOptions): Promise<string> {
    const data = await this.executeQuery<{ flushInternalLogs: string }>(
      MUTATION_FLUSH_INTERNAL_LOGS,
      { endLogId },
      'itn_flush_internal_logs',
      options,
    );
    return data.flushInternalLogs;
  }

  /** Start sending payments; returns the handle for {@link stopScheduledTransactions}. */
  async schedulePayments(details: PaymentsDetails, options?: ItnCallOptions): Promise<string> {
    const input = paymentsInput(details);
    const data = await this.executeQuery<{ schedulePayments: string }>(
      MUTATION_SCHEDULE_PAYMENTS,
      { input },
      'itn_schedule_payments',
      options,
    );
    return data.schedulePayments;
  }

  /** Start sending zkApp commands; returns the handle for {@link stopScheduledTransactions}. */
  async scheduleZkappCommands(
    details: ZkappCommandsDetails,
    options?: ItnCallOptions,
  ): Promise<string> {
    const input = zkappInput(details);
    const data = await this.executeQuery<{ scheduleZkappCommands: string }>(
      MUTATION_SCHEDULE_ZKAPP_COMMANDS,
      { input },
      'itn_schedule_zkapp_commands',
      options,
    );
    return data.scheduleZkappCommands;
  }

  /** Stop the transactions of a schedule handle. */
  async stopScheduledTransactions(handle: string, options?: ItnCallOptions): Promise<string> {
    const data = await this.executeQuery<{ stopScheduledTransactions: string }>(
      MUTATION_STOP_SCHEDULED_TRANSACTIONS,
      { handle },
      'itn_stop_scheduled_transactions',
      options,
    );
    return data.stopScheduledTransactions;
  }

  /** Change the node's connection gating. */
  async updateGating(update: GatingUpdate, options?: ItnCallOptions): Promise<string> {
    const input = {
      addedPeers: nonNull(update.addedPeers),
      cleanAddedPeers: update.cleanAddedPeers,
      isolate: update.isolate,
      bannedPeers: nonNull(update.bannedPeers),
      trustedPeers: nonNull(update.trustedPeers),
    };
    const data = await this.executeQuery<{ updateGating: string }>(
      MUTATION_UPDATE_GATING,
      { input },
      'itn_update_gating',
      options,
    );
    return data.updateGating;
  }

  /**
   * Stop the daemon after `delaySeconds` (the daemon's minimum is 5), deleting
   * its configuration directory if `cleanConfig` is true.
   */
  async stopDaemon(
    params: { delaySeconds?: number; cleanConfig?: boolean } = {},
    options?: ItnCallOptions,
  ): Promise<string> {
    const data = await this.executeQuery<{ stopDaemon: string }>(
      MUTATION_STOP_DAEMON,
      { delaySeconds: params.delaySeconds ?? null, cleanConfig: params.cleanConfig ?? null },
      'itn_stop_daemon',
      options,
    );
    return data.stopDaemon;
  }

  /**
   * Set the block producer's limit of zkApp commands per block; null removes
   * the limit. Returns the limit now in force.
   */
  async setZkappCommandLimit(
    limit: number | null,
    options?: ItnCallOptions,
  ): Promise<number | null> {
    const data = await this.executeQuery<{ zkAppCommandLimit: number | null }>(
      MUTATION_ZKAPP_COMMAND_LIMIT,
      { limit },
      'itn_set_zkapp_command_limit',
      options,
    );
    return data.zkAppCommandLimit;
  }

  // The following methods need a daemon with MinaProtocol/mina#19616; older
  // daemons answer them with a GraphQL error. A handle is a UUID that the
  // caller chooses and records before the call. A call with the handle of a
  // running scheduler starts nothing and returns that handle, so these calls
  // may be repeated after a transport error.

  /** The git commit of the daemon's build. */
  async commitId(options?: ItnCallOptions): Promise<string> {
    const data = await this.executeQuery<{ auth: { commitId: string } }>(
      QUERY_COMMIT_ID,
      undefined,
      'itn_commit_id',
      options,
    );
    return data.auth.commitId;
  }

  /** Handles of the running payment and zkApp schedulers and account-creation jobs. */
  async scheduledTransactions(options?: ItnCallOptions): Promise<string[]> {
    const data = await this.executeQuery<{ scheduledTransactions: string[] }>(
      QUERY_SCHEDULED_TRANSACTIONS,
      undefined,
      'itn_scheduled_transactions',
      options,
    );
    return data.scheduledTransactions;
  }

  /** Start sending payments under `handle`; returns it. */
  async schedulePaymentsWithHandle(
    details: PaymentsDetails,
    handle: string,
    options?: ItnCallOptions,
  ): Promise<string> {
    const data = await this.executeQuery<{ schedulePayments: string }>(
      MUTATION_SCHEDULE_PAYMENTS_WITH_HANDLE,
      { input: paymentsInput(details), handle },
      'itn_schedule_payments_with_handle',
      options,
    );
    return data.schedulePayments;
  }

  /** Start sending zkApp commands under `handle`; returns it. */
  async scheduleZkappCommandsWithHandle(
    details: ZkappCommandsDetails,
    handle: string,
    options?: ItnCallOptions,
  ): Promise<string> {
    const data = await this.executeQuery<{ scheduleZkappCommands: string }>(
      MUTATION_SCHEDULE_ZKAPP_COMMANDS_WITH_HANDLE,
      { input: zkappInput(details), handle },
      'itn_schedule_zkapp_commands_with_handle',
      options,
    );
    return data.scheduleZkappCommands;
  }

  /**
   * Create `details.numAccounts` accounts and fund them in the background; the
   * keys are returned at once. Wait until {@link scheduledTransactions} no
   * longer lists the returned handle. Omit `handle` to let the daemon choose it.
   */
  async createAccounts(
    details: CreateAccountsDetails,
    handle?: string,
    options?: ItnCallOptions,
  ): Promise<CreatedAccounts> {
    const input = {
      feePayer: details.feePayer,
      numAccounts: details.numAccounts,
      fee: details.fee.toNanominaString(),
      amount: details.amount.toNanominaString(),
    };
    const data = await this.executeQuery<{ createAccounts: CreatedAccounts }>(
      MUTATION_CREATE_ACCOUNTS,
      { input, handle: handle ?? null },
      'itn_create_accounts',
      options,
    );
    return data.createAccounts;
  }
}

/** The `PaymentsDetails` input of schedulePayments. */
function paymentsInput(details: PaymentsDetails): Record<string, unknown> {
  return {
    durationMin: details.durationMin,
    tps: details.tps,
    memoPrefix: details.memoPrefix,
    maxFee: details.maxFee.toNanominaString(),
    minFee: details.minFee.toNanominaString(),
    amount: details.amount.toNanominaString(),
    receiver: details.receiver,
    senders: nonNull(details.senders),
  };
}

/** The `ZkappCommandsDetails` input of scheduleZkappCommands. */
function zkappInput(details: ZkappCommandsDetails): Record<string, unknown> {
  const input: Record<string, unknown> = {
    maxAccountUpdates: details.maxAccountUpdates ?? null,
    maxCost: details.maxCost,
    accountQueueSize: details.accountQueueSize,
    deploymentFee: details.deploymentFee.toNanominaString(),
    maxFee: details.maxFee.toNanominaString(),
    minFee: details.minFee.toNanominaString(),
    initBalance: details.initBalance.toNanominaString(),
    maxNewZkappBalance: details.maxNewZkappBalance.toNanominaString(),
    minNewZkappBalance: details.minNewZkappBalance.toNanominaString(),
    maxBalanceChange: details.maxBalanceChange.toNanominaString(),
    minBalanceChange: details.minBalanceChange.toNanominaString(),
    noPrecondition: details.noPrecondition,
    memoPrefix: details.memoPrefix,
    durationMin: details.durationMin,
    tps: details.tps,
    numNewAccounts: details.numNewAccounts,
    numZkappsToDeploy: details.numZkappsToDeploy,
    feePayers: nonNull(details.feePayers),
  };
  if (details.nonDefaultToken !== undefined) input.nonDefaultToken = details.nonDefaultToken;
  return input;
}

/** `UInt16` arrives as a string ("8302"); accept a number too. */
function parseUint16(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 0xffff) {
    throw new Error(`itn_auth: invalid ${field}: ${String(value)}`);
  }
  return n;
}

function parseAuth(raw: unknown): ItnAuth {
  const a = raw as Record<string, unknown> | null | undefined;
  if (!a || typeof a.serverUuid !== 'string' || a.serverUuid === '') {
    throw new Error('itn_auth: missing field auth.serverUuid');
  }
  return {
    serverUuid: a.serverUuid,
    signerSequenceNumber: parseUint16(a.signerSequenceNumber, 'signerSequenceNumber'),
    libp2pPort: parseUint16(a.libp2pPort, 'libp2pPort'),
    peerId: typeof a.peerId === 'string' ? a.peerId : null,
    isBlockProducer: a.isBlockProducer === true,
  };
}
