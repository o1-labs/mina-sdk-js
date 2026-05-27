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
    uptimeSecs
    stateHash
    commitId
    peers {
      peerId
      host
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

export const QUERY_ACCOUNT = `
query ($publicKey: PublicKey!) {
  account(publicKey: $publicKey) {
    publicKey
    nonce
    delegate
    tokenId
    balance {
      total
      liquid
      locked
    }
  }
}
`;

export const QUERY_ACCOUNT_WITH_TOKEN = `
query ($publicKey: PublicKey!, $token: TokenId!) {
  account(publicKey: $publicKey, token: $token) {
    publicKey
    nonce
    delegate
    tokenId
    balance {
      total
      liquid
      locked
    }
  }
}
`;

export const QUERY_BEST_CHAIN = `
query ($maxLength: Int) {
  bestChain(maxLength: $maxLength) {
    stateHash
    commandTransactionCount
    creatorAccount {
      publicKey
    }
    protocolState {
      consensusState {
        blockHeight
        slotSinceGenesis
        slot
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

export const QUERY_POOLED_USER_COMMANDS = `
query ($publicKey: PublicKey!) {
  pooledUserCommands(publicKey: $publicKey) {
    id
    hash
    kind
    nonce
    amount
    fee
    from
    to
  }
}
`;

export const QUERY_POOLED_USER_COMMANDS_ALL = `
query {
  pooledUserCommands {
    id
    hash
    kind
    nonce
    amount
    fee
    from
    to
  }
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
export const MUTATION_SEND_PAYMENT = `
mutation ($input: SendPaymentInput!, $signature: SignatureInput) {
  sendPayment(input: $input, signature: $signature) {
    payment {
      id
      hash
      nonce
    }
  }
}
`;

export const MUTATION_SEND_DELEGATION = `
mutation ($input: SendDelegationInput!, $signature: SignatureInput) {
  sendDelegation(input: $input, signature: $signature) {
    delegation {
      id
      hash
      nonce
    }
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
      coinbaseReceiverAccount { publicKey }
      feeTransfer { recipient fee type }
      userCommands {
        id hash kind nonce
        source { publicKey }
        receiver { publicKey }
        amount fee memo
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
