// GraphQL documents for the daemon's ITN server. They are the documents of
// spec/itn-operations.graphql (a copy of o1-labs/mina-sdk-spec, whose CI
// validates them against the daemon's schema_itn); tests/spec.test.ts checks
// that they stay identical. Use them with ItnClient.executeQuery for custom
// selections.

/** Server UUID and the signer's sequence number; the only unsequenced operation. */
export const QUERY_AUTH = `query Auth {
  auth {
    serverUuid
    signerSequenceNumber
    libp2pPort
    peerId
    isBlockProducer
  }
}`;

/** Global slots the node's block producer keys won in the current epoch. */
export const QUERY_SLOTS_WON = `query SlotsWon {
  slotsWon
}`;

/** Internal logs with an ID of at least $startLogId. */
export const QUERY_INTERNAL_LOGS = `query InternalLogs($startLogId: Int!) {
  internalLogs(startLogId: $startLogId) {
    id
    timestamp
    message
    metadata {
      item
      value
    }
    process
  }
}`;

/** Drop internal logs up to and including $endLogId. */
export const MUTATION_FLUSH_INTERNAL_LOGS = `mutation FlushInternalLogs($endLogId: Int!) {
  flushInternalLogs(endLogId: $endLogId)
}`;

/** Start sending payments; returns a handle for stopScheduledTransactions. */
export const MUTATION_SCHEDULE_PAYMENTS = `mutation SchedulePayments($input: PaymentsDetails!) {
  schedulePayments(input: $input)
}`;

/** Start sending zkApp commands; returns a handle for stopScheduledTransactions. */
export const MUTATION_SCHEDULE_ZKAPP_COMMANDS = `mutation ScheduleZkappCommands($input: ZkappCommandsDetails!) {
  scheduleZkappCommands(input: $input)
}`;

/** Stop the transactions of a schedule handle. */
export const MUTATION_STOP_SCHEDULED_TRANSACTIONS = `mutation StopScheduledTransactions($handle: String!) {
  stopScheduledTransactions(handle: $handle)
}`;

/** Change the node's connection gating. */
export const MUTATION_UPDATE_GATING = `mutation UpdateGating($input: GatingUpdate!) {
  updateGating(input: $input)
}`;

/** Stop the daemon after $delaySeconds, optionally deleting its configuration directory. */
export const MUTATION_STOP_DAEMON = `mutation StopDaemon($delaySeconds: Int, $cleanConfig: Boolean) {
  stopDaemon(delaySeconds: $delaySeconds, cleanConfig: $cleanConfig)
}`;

/** Set the block producer's limit of zkApp commands per block; null removes it. */
export const MUTATION_ZKAPP_COMMAND_LIMIT = `mutation ZkappCommandLimit($limit: Int) {
  zkAppCommandLimit(limit: $limit)
}`;

/** The daemon's git commit. Needs a daemon with MinaProtocol/mina#19616; older daemons answer with a GraphQL error. */
export const QUERY_COMMIT_ID = `query CommitId {
  auth {
    commitId
  }
}`;

/** Handles of the running payment and zkApp schedulers and account-creation jobs (mina#19616). */
export const QUERY_SCHEDULED_TRANSACTIONS = `query ScheduledTransactions {
  scheduledTransactions
}`;

/** Start sending payments under a handle the caller chose (mina#19616). */
export const MUTATION_SCHEDULE_PAYMENTS_WITH_HANDLE = `mutation SchedulePaymentsWithHandle($input: PaymentsDetails!, $handle: String!) {
  schedulePayments(input: $input, handle: $handle)
}`;

/** Start sending zkApp commands under a handle the caller chose (mina#19616). */
export const MUTATION_SCHEDULE_ZKAPP_COMMANDS_WITH_HANDLE = `mutation ScheduleZkappCommandsWithHandle($input: ZkappCommandsDetails!, $handle: String!) {
  scheduleZkappCommands(input: $input, handle: $handle)
}`;

/** Create and fund new accounts in the background under a handle (mina#19616). */
export const MUTATION_CREATE_ACCOUNTS = `mutation CreateAccounts($input: CreateAccountsDetails!, $handle: String) {
  createAccounts(input: $input, handle: $handle) {
    handle
    accounts {
      publicKey
      privateKey
    }
  }
}`;

/** Every ITN document, for the conformance test. @internal */
export const ALL_ITN_DOCUMENTS = [
  QUERY_AUTH,
  QUERY_SLOTS_WON,
  QUERY_INTERNAL_LOGS,
  MUTATION_FLUSH_INTERNAL_LOGS,
  MUTATION_SCHEDULE_PAYMENTS,
  MUTATION_SCHEDULE_ZKAPP_COMMANDS,
  MUTATION_STOP_SCHEDULED_TRANSACTIONS,
  MUTATION_UPDATE_GATING,
  MUTATION_STOP_DAEMON,
  MUTATION_ZKAPP_COMMAND_LIMIT,
  QUERY_COMMIT_ID,
  QUERY_SCHEDULED_TRANSACTIONS,
  MUTATION_SCHEDULE_PAYMENTS_WITH_HANDLE,
  MUTATION_SCHEDULE_ZKAPP_COMMANDS_WITH_HANDLE,
  MUTATION_CREATE_ACCOUNTS,
];
