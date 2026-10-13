// GraphQL documents for the daemon's public API. These are the documents of
// spec/operations.graphql, the common API of the Mina SDKs (see
// spec/SPEC.md). spec/ is a copy of o1-labs/mina-sdk-spec at the tag in
// spec/VERSION; tests/spec.test.ts checks that these documents stay
// identical. Change the specification first.

export const QUERY_SYNC_STATUS = `query SyncStatus {
  syncStatus
}`;

export const QUERY_DAEMON_STATUS = `query DaemonStatus {
  daemonStatus {
    syncStatus
    blockchainLength
    highestBlockLengthReceived
    highestUnvalidatedBlockLengthReceived
    uptimeSecs
    stateHash
    commitId
    numAccounts
    ledgerMerkleRoot
    chainId
    catchupStatus
    blockProductionKeys
    coinbaseReceiver
    globalSlotSinceGenesisBestTip
    consensusTimeNow {
      epoch
      slot
      globalSlot
      startTime
      endTime
    }
    peers {
      peerId
      host
      libp2pPort
    }
    addrsAndPorts {
      externalIp
      bindIp
      clientPort
      libp2pPort
      peer {
        host
        libp2pPort
        peerId
      }
    }
  }
}`;

export const QUERY_DAEMON_METRICS = `query DaemonMetrics {
  daemonStatus {
    metrics {
      blockProductionDelay
      transactionPoolDiffReceived
      transactionPoolDiffBroadcasted
      transactionsAddedToPool
      transactionPoolSize
      snarkPoolDiffReceived
      snarkPoolDiffBroadcasted
      pendingSnarkWork
      snarkPoolSize
    }
  }
}`;

export const QUERY_NETWORK_ID = `query NetworkId {
  networkID
}`;

export const QUERY_ACCOUNT = `query Account($publicKey: PublicKey!, $token: TokenId) {
  account(publicKey: $publicKey, token: $token) {
    publicKey
    nonce
    delegate
    tokenId
    tokenSymbol
    votingFor
    receiptChainHash
    balance {
      total
      liquid
      locked
      blockHeight
    }
    timing {
      initialMinimumBalance
      cliffTime
      cliffAmount
      vestingPeriod
      vestingIncrement
    }
    permissions {
      editState
      send
      receive
      access
      setDelegate
      setPermissions
      setVerificationKey {
        auth
        txnVersion
      }
      setZkappUri
      editActionState
      setTokenSymbol
      incrementNonce
      setVotingFor
      setTiming
    }
    zkappState
    provedState
    zkappUri
  }
}`;

export const QUERY_BEST_CHAIN = `query BestChain($maxLength: Int) {
  bestChain(maxLength: $maxLength) {
    stateHash
    commandTransactionCount
    creatorAccount {
      publicKey
    }
    protocolState {
      previousStateHash
      consensusState {
        blockHeight
        epoch
        slot
        slotSinceGenesis
        blockCreator
        coinbaseReceiever
        stakingEpochData {
          epochLength
          seed
          ledger {
            hash
          }
        }
        nextEpochData {
          seed
          ledger {
            hash
          }
        }
      }
      blockchainState {
        date
        utcDate
        snarkedLedgerHash
        stagedLedgerHash
      }
    }
    snarkJobs {
      prover
      fee
      workIds
    }
    transactions {
      coinbase
      coinbaseReceiverAccount {
        publicKey
      }
      feeTransfer {
        recipient
        fee
        type
      }
      userCommands {
        id
        hash
        kind
        nonce
        source {
          publicKey
        }
        receiver {
          publicKey
        }
        amount
        fee
        memo
        failureReason
      }
      zkappCommands {
        id
        hash
        failureReason {
          index
          failures
        }
        zkappCommand {
          memo
          feePayer {
            authorization
            body {
              publicKey
              fee
              nonce
              validUntil
            }
          }
          accountUpdates {
            authorization {
              signature
              proof
            }
            body {
              publicKey
              tokenId
              callDepth
              callData
              actions
              events
              incrementNonce
              useFullCommitment
              implicitAccountCreationFee
              balanceChange {
                magnitude
                sgn
              }
              mayUseToken {
                parentsOwnToken
                inheritFromParent
              }
              authorizationKind {
                isSigned
                isProved
                verificationKeyHash
              }
              update {
                appState
                delegate
                zkappUri
                votingFor
                tokenSymbol
                verificationKey {
                  hash
                  data
                }
                timing {
                  initialMinimumBalance
                  cliffTime
                  cliffAmount
                  vestingPeriod
                  vestingIncrement
                }
                permissions {
                  editState
                  send
                  receive
                  access
                  setDelegate
                  setPermissions
                  setVerificationKey {
                    auth
                    txnVersion
                  }
                  setZkappUri
                  editActionState
                  setTokenSymbol
                  incrementNonce
                  setVotingFor
                  setTiming
                }
              }
              preconditions {
                validWhile {
                  lower
                  upper
                }
                network {
                  snarkedLedgerHash
                  blockchainLength {
                    lower
                    upper
                  }
                  minWindowDensity {
                    lower
                    upper
                  }
                  totalCurrency {
                    lower
                    upper
                  }
                  globalSlotSinceGenesis {
                    lower
                    upper
                  }
                  stakingEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                  nextEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                }
                account {
                  balance {
                    lower
                    upper
                  }
                  nonce {
                    lower
                    upper
                  }
                  receiptChainHash
                  delegate
                  state
                  actionState
                  provedState
                  isNew
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export const QUERY_GENESIS_BLOCK = `query GenesisBlock {
  genesisBlock {
    stateHash
    commandTransactionCount
    creatorAccount {
      publicKey
    }
    protocolState {
      previousStateHash
      consensusState {
        blockHeight
        epoch
        slot
        slotSinceGenesis
        blockCreator
        coinbaseReceiever
        stakingEpochData {
          epochLength
          seed
          ledger {
            hash
          }
        }
        nextEpochData {
          seed
          ledger {
            hash
          }
        }
      }
      blockchainState {
        date
        utcDate
        snarkedLedgerHash
        stagedLedgerHash
      }
    }
    snarkJobs {
      prover
      fee
      workIds
    }
    transactions {
      coinbase
      coinbaseReceiverAccount {
        publicKey
      }
      feeTransfer {
        recipient
        fee
        type
      }
      userCommands {
        id
        hash
        kind
        nonce
        source {
          publicKey
        }
        receiver {
          publicKey
        }
        amount
        fee
        memo
        failureReason
      }
      zkappCommands {
        id
        hash
        failureReason {
          index
          failures
        }
        zkappCommand {
          memo
          feePayer {
            authorization
            body {
              publicKey
              fee
              nonce
              validUntil
            }
          }
          accountUpdates {
            authorization {
              signature
              proof
            }
            body {
              publicKey
              tokenId
              callDepth
              callData
              actions
              events
              incrementNonce
              useFullCommitment
              implicitAccountCreationFee
              balanceChange {
                magnitude
                sgn
              }
              mayUseToken {
                parentsOwnToken
                inheritFromParent
              }
              authorizationKind {
                isSigned
                isProved
                verificationKeyHash
              }
              update {
                appState
                delegate
                zkappUri
                votingFor
                tokenSymbol
                verificationKey {
                  hash
                  data
                }
                timing {
                  initialMinimumBalance
                  cliffTime
                  cliffAmount
                  vestingPeriod
                  vestingIncrement
                }
                permissions {
                  editState
                  send
                  receive
                  access
                  setDelegate
                  setPermissions
                  setVerificationKey {
                    auth
                    txnVersion
                  }
                  setZkappUri
                  editActionState
                  setTokenSymbol
                  incrementNonce
                  setVotingFor
                  setTiming
                }
              }
              preconditions {
                validWhile {
                  lower
                  upper
                }
                network {
                  snarkedLedgerHash
                  blockchainLength {
                    lower
                    upper
                  }
                  minWindowDensity {
                    lower
                    upper
                  }
                  totalCurrency {
                    lower
                    upper
                  }
                  globalSlotSinceGenesis {
                    lower
                    upper
                  }
                  stakingEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                  nextEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                }
                account {
                  balance {
                    lower
                    upper
                  }
                  nonce {
                    lower
                    upper
                  }
                  receiptChainHash
                  delegate
                  state
                  actionState
                  provedState
                  isNew
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export const QUERY_BLOCK = `query Block($stateHash: String, $height: Int) {
  block(stateHash: $stateHash, height: $height) {
    stateHash
    commandTransactionCount
    creatorAccount {
      publicKey
    }
    protocolState {
      previousStateHash
      consensusState {
        blockHeight
        epoch
        slot
        slotSinceGenesis
        blockCreator
        coinbaseReceiever
        stakingEpochData {
          epochLength
          seed
          ledger {
            hash
          }
        }
        nextEpochData {
          seed
          ledger {
            hash
          }
        }
      }
      blockchainState {
        date
        utcDate
        snarkedLedgerHash
        stagedLedgerHash
      }
    }
    snarkJobs {
      prover
      fee
      workIds
    }
    transactions {
      coinbase
      coinbaseReceiverAccount {
        publicKey
      }
      feeTransfer {
        recipient
        fee
        type
      }
      userCommands {
        id
        hash
        kind
        nonce
        source {
          publicKey
        }
        receiver {
          publicKey
        }
        amount
        fee
        memo
        failureReason
      }
      zkappCommands {
        id
        hash
        failureReason {
          index
          failures
        }
        zkappCommand {
          memo
          feePayer {
            authorization
            body {
              publicKey
              fee
              nonce
              validUntil
            }
          }
          accountUpdates {
            authorization {
              signature
              proof
            }
            body {
              publicKey
              tokenId
              callDepth
              callData
              actions
              events
              incrementNonce
              useFullCommitment
              implicitAccountCreationFee
              balanceChange {
                magnitude
                sgn
              }
              mayUseToken {
                parentsOwnToken
                inheritFromParent
              }
              authorizationKind {
                isSigned
                isProved
                verificationKeyHash
              }
              update {
                appState
                delegate
                zkappUri
                votingFor
                tokenSymbol
                verificationKey {
                  hash
                  data
                }
                timing {
                  initialMinimumBalance
                  cliffTime
                  cliffAmount
                  vestingPeriod
                  vestingIncrement
                }
                permissions {
                  editState
                  send
                  receive
                  access
                  setDelegate
                  setPermissions
                  setVerificationKey {
                    auth
                    txnVersion
                  }
                  setZkappUri
                  editActionState
                  setTokenSymbol
                  incrementNonce
                  setVotingFor
                  setTiming
                }
              }
              preconditions {
                validWhile {
                  lower
                  upper
                }
                network {
                  snarkedLedgerHash
                  blockchainLength {
                    lower
                    upper
                  }
                  minWindowDensity {
                    lower
                    upper
                  }
                  totalCurrency {
                    lower
                    upper
                  }
                  globalSlotSinceGenesis {
                    lower
                    upper
                  }
                  stakingEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                  nextEpochData {
                    seed
                    startCheckpoint
                    lockCheckpoint
                    epochLength {
                      lower
                      upper
                    }
                    ledger {
                      hash
                      totalCurrency {
                        lower
                        upper
                      }
                    }
                  }
                }
                account {
                  balance {
                    lower
                    upper
                  }
                  nonce {
                    lower
                    upper
                  }
                  receiptChainHash
                  delegate
                  state
                  actionState
                  provedState
                  isNew
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export const QUERY_PEERS = `query Peers {
  getPeers {
    peerId
    host
    libp2pPort
  }
}`;

export const QUERY_POOLED_USER_COMMANDS = `query PooledUserCommands($publicKey: PublicKey) {
  pooledUserCommands(publicKey: $publicKey) {
    id
    hash
    kind
    nonce
    amount
    fee
    validUntil
    token
    feeToken
    from
    to
    source {
      publicKey
    }
    receiver {
      publicKey
    }
    memo
    failureReason
  }
}`;

export const QUERY_POOLED_ZKAPP_COMMANDS = `query PooledZkappCommands($publicKey: PublicKey) {
  pooledZkappCommands(publicKey: $publicKey) {
    id
    hash
    zkappCommand {
      memo
      feePayer {
        body {
          publicKey
          fee
          nonce
          validUntil
        }
      }
    }
    failureReason {
      index
      failures
    }
  }
}`;

export const QUERY_TRANSACTION_STATUS = `query TransactionStatus($payment: ID, $zkappTransaction: ID) {
  transactionStatus(payment: $payment, zkappTransaction: $zkappTransaction)
}`;

export const QUERY_GENESIS_CONSTANTS = `query GenesisConstants {
  genesisConstants {
    genesisTimestamp
    coinbase
    accountCreationFee
  }
}`;

export const QUERY_TRACKED_ACCOUNTS = `query TrackedAccounts {
  trackedAccounts {
    publicKey
    balance {
      total
    }
  }
}`;

export const QUERY_SNARK_POOL = `query SnarkPool {
  snarkPool {
    fee
    prover
    workIds
  }
}`;

export const QUERY_FORK_CONFIG = `query ForkConfig {
  fork_config
}`;

export const MUTATION_SEND_PAYMENT = `mutation SendPayment($input: SendPaymentInput!, $signature: SignatureInput) {
  sendPayment(input: $input, signature: $signature) {
    payment {
      id
      hash
      kind
      nonce
      source {
        publicKey
      }
      receiver {
        publicKey
      }
      amount
      fee
      memo
    }
  }
}`;

export const MUTATION_SEND_DELEGATION = `mutation SendDelegation($input: SendDelegationInput!, $signature: SignatureInput) {
  sendDelegation(input: $input, signature: $signature) {
    delegation {
      id
      hash
      kind
      nonce
      source {
        publicKey
      }
      receiver {
        publicKey
      }
      amount
      fee
      memo
    }
  }
}`;

export const MUTATION_SEND_ZKAPP = `mutation SendZkapp($input: SendZkappInput!) {
  sendZkapp(input: $input) {
    zkapp {
      id
      hash
      zkappCommand {
        memo
        feePayer {
          body {
            publicKey
            fee
            nonce
            validUntil
          }
        }
      }
      failureReason {
        index
        failures
      }
    }
  }
}`;

export const MUTATION_UNLOCK_ACCOUNT = `mutation UnlockAccount($input: UnlockInput!) {
  unlockAccount(input: $input) {
    publicKey
  }
}`;

export const MUTATION_SET_SNARK_WORKER = `mutation SetSnarkWorker($input: SetSnarkWorkerInput!) {
  setSnarkWorker(input: $input) {
    lastSnarkWorker
  }
}`;

export const MUTATION_SET_SNARK_WORK_FEE = `mutation SetSnarkWorkFee($fee: UInt64!) {
  setSnarkWorkFee(input: {fee: $fee}) {
    lastFee
  }
}`;

/** @deprecated QUERY_ACCOUNT takes an optional `$token`. */
export const QUERY_ACCOUNT_WITH_TOKEN = QUERY_ACCOUNT;

/** @deprecated QUERY_POOLED_USER_COMMANDS takes an optional `$publicKey`. */
export const QUERY_POOLED_USER_COMMANDS_ALL = QUERY_POOLED_USER_COMMANDS;

/** Every document of the specification, for the conformance test. @internal */
export const ALL_DOCUMENTS = [
  QUERY_SYNC_STATUS,
  QUERY_DAEMON_STATUS,
  QUERY_DAEMON_METRICS,
  QUERY_NETWORK_ID,
  QUERY_ACCOUNT,
  QUERY_BEST_CHAIN,
  QUERY_GENESIS_BLOCK,
  QUERY_BLOCK,
  QUERY_PEERS,
  QUERY_POOLED_USER_COMMANDS,
  QUERY_POOLED_ZKAPP_COMMANDS,
  QUERY_TRANSACTION_STATUS,
  QUERY_GENESIS_CONSTANTS,
  QUERY_TRACKED_ACCOUNTS,
  QUERY_SNARK_POOL,
  QUERY_FORK_CONFIG,
  MUTATION_SEND_PAYMENT,
  MUTATION_SEND_DELEGATION,
  MUTATION_SEND_ZKAPP,
  MUTATION_UNLOCK_ACCOUNT,
  MUTATION_SET_SNARK_WORKER,
  MUTATION_SET_SNARK_WORK_FEE,
];
