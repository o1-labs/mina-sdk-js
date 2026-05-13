import type { Currency } from './currency.js';

export interface AccountBalance {
  total: Currency;
  liquid?: Currency;
  locked?: Currency;
}

export interface AccountData {
  publicKey: string;
  nonce: number;
  delegate: string;
  tokenId: string;
  balance: AccountBalance;
}

export interface PeerInfo {
  peerId: string;
  host: string;
  port: number;
}

export interface DaemonStatus {
  syncStatus: string;
  blockchainLength?: number;
  highestBlockLengthReceived?: number;
  uptimeSecs?: number;
  stateHash: string;
  commitId: string;
  peers: PeerInfo[];
}

export interface BlockInfo {
  stateHash: string;
  height: number;
  globalSlotSinceHardFork: number;
  globalSlotSinceGenesis: number;
  creatorPublicKey: string;
  commandTransactionCount: number;
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
}

export interface SendPaymentResult {
  id: string;
  hash: string;
  nonce: number;
}

export interface SendDelegationResult {
  id: string;
  hash: string;
  nonce: number;
}

export interface SendPaymentParams {
  sender: string;
  receiver: string;
  amount: Currency;
  fee: Currency;
  memo?: string;
  nonce?: number;
}

export interface SendDelegationParams {
  sender: string;
  delegateTo: string;
  fee: Currency;
  memo?: string;
  nonce?: number;
}
