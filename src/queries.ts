export const QUERY_SYNC_STATUS = `
query {
  syncStatus
}
`;

export const QUERY_DAEMON_STATUS = `
query {
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
    }
  }
}
`;

export const QUERY_NETWORK_ID = `
query {
  networkID
}
`;

// Account selection covers everything an SDK consumer or MCP tool typically
// needs: balance, nonce, delegate, vesting timing, permissions, zkApp state.
// Optional fields in `AccountData` map 1:1 to the selection here; the daemon
// returns null for fields that don't apply to a given account (e.g. timing
// is null on untimed accounts, zkappState is null on non-zkApp accounts).
const ACCOUNT_SELECTION = `
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
      setVerificationKey
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
`;

export const QUERY_ACCOUNT = `
query ($publicKey: PublicKey!) {
  account(publicKey: $publicKey) {${ACCOUNT_SELECTION}  }
}
`;

export const QUERY_ACCOUNT_WITH_TOKEN = `
query ($publicKey: PublicKey!, $token: TokenId!) {
  account(publicKey: $publicKey, token: $token) {${ACCOUNT_SELECTION}  }
}
`;

// bestChain returns blocks rather than just stateHashes; covers the same
// shape as `block` plus stakingEpochData and the typo'd `coinbaseReceiever`
// field (preserved verbatim — that's the daemon's field name).
export const QUERY_BEST_CHAIN = `
query ($maxLength: Int) {
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
        }
      }
      blockchainState {
        date
        utcDate
        snarkedLedgerHash
        stagedLedgerHash
      }
    }
    transactions {
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
    }
  }
}
`;

export const QUERY_PEERS = `
query {
  getPeers {
    peerId
    host
    libp2pPort
  }
}
`;

// The daemon's `pooledUserCommands` returns both the legacy flat `from`/`to`
// pubkey fields and the newer `source { publicKey }` / `receiver { publicKey }`
// account references. We select both so consumers can use whichever shape
// matches their existing code; the typed return mirrors both.
const POOLED_COMMAND_SELECTION = `
    id
    hash
    kind
    nonce
    amount
    fee
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
`;

export const QUERY_POOLED_USER_COMMANDS = `
query ($publicKey: PublicKey!) {
  pooledUserCommands(publicKey: $publicKey) {${POOLED_COMMAND_SELECTION}  }
}
`;

export const QUERY_POOLED_USER_COMMANDS_ALL = `
query {
  pooledUserCommands {${POOLED_COMMAND_SELECTION}  }
}
`;

// $signature is optional. When omitted the daemon signs with its own wallet
// keys (tutorial / lightnet). When provided, the daemon verifies the supplied
// signature and submits — the path public daemons (devnet/mainnet) need
// because they don't hold user keys.
//
// CAUTION: the variable is declared, so when callers don't want client-side
// signing they must pass `signature: null` explicitly. Omitting the variable
// triggers the daemon's "Missing variable `signature`" error.
const SUBMITTED_COMMAND_SELECTION = `
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
`;

export const MUTATION_SEND_PAYMENT = `
mutation ($input: SendPaymentInput!, $signature: SignatureInput) {
  sendPayment(input: $input, signature: $signature) {
    payment {${SUBMITTED_COMMAND_SELECTION}    }
  }
}
`;

export const MUTATION_SEND_DELEGATION = `
mutation ($input: SendDelegationInput!, $signature: SignatureInput) {
  sendDelegation(input: $input, signature: $signature) {
    delegation {${SUBMITTED_COMMAND_SELECTION}    }
  }
}
`;

export const MUTATION_SET_SNARK_WORKER = `
mutation ($input: SetSnarkWorkerInput!) {
  setSnarkWorker(input: $input) {
    lastSnarkWorker
  }
}
`;

export const MUTATION_SET_SNARK_WORK_FEE = `
mutation ($fee: UInt64!) {
  setSnarkWorkFee(input: { fee: $fee }) {
    lastFee
  }
}
`;

// The daemon's block resolver enforces "exactly one of stateHash / height".
// Callers must pass exactly one; passing both or neither errors at the daemon.
export const QUERY_BLOCK = `
query ($stateHash: String, $height: Int) {
  block(stateHash: $stateHash, height: $height) {
    stateHash
    protocolState {
      previousStateHash
      consensusState {
        blockHeight
        epoch
        slot
        slotSinceGenesis
        blockCreator
        coinbaseReceiever
      }
      blockchainState {
        date
        utcDate
        snarkedLedgerHash
        stagedLedgerHash
      }
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
    }
  }
}
`;

// Pass at most one of $payment / $zkappTransaction. Both are nullable; the
// daemon's resolver rejects the request if neither is set.
export const QUERY_TRANSACTION_STATUS = `
query ($payment: ID, $zkappTransaction: ID) {
  transactionStatus(payment: $payment, zkappTransaction: $zkappTransaction)
}
`;

export const QUERY_GENESIS_CONSTANTS = `
query {
  genesisConstants {
    genesisTimestamp
    coinbase
    accountCreationFee
  }
}
`;

// trackedAccounts surfaces the public keys the daemon is tracking
// (lightnet/tutorial setups normally expose hundreds; public daemons usually
// return an empty list).
export const QUERY_TRACKED_ACCOUNTS = `
query {
  trackedAccounts {
    publicKey
    balance {
      total
    }
  }
}
`;
