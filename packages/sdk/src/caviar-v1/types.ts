export type OrderParams = {
  pool: string;
  collection: string;
  tokenIds: string[];
  deadline: string;
  baseTokenAmount: string;
  proofs: string[][];
  stolenProofs: StolenProof[];
  isBuy: boolean;
  extra: {
    prices: string[];
  };
};

export type StolenProof = {
  id: string;
  payload: string;
  timestamp: string;
  signature: string;
};
