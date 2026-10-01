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
];
