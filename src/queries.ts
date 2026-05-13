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
query ($publicKey: PublicKey!, $token: UInt64!) {
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

export const MUTATION_SEND_PAYMENT = `
mutation ($input: SendPaymentInput!) {
  sendPayment(input: $input) {
    payment {
      id
      hash
      nonce
    }
  }
}
`;

export const MUTATION_SEND_DELEGATION = `
mutation ($input: SendDelegationInput!) {
  sendDelegation(input: $input) {
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
