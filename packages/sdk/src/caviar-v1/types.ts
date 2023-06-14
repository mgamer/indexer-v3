export type OrderParams = {
  pool: string;
  collection: string;
  tokenIds: string[];
  deadline: string;
  baseTokenAmount: string;
  proofs: string[][];
  stolenProofs: StolenProof[];
  isBuy: boolean;
};

export type StolenProof = {
  id: string;
  payload: string;
  timestamp: string;
  signature: string;
};
