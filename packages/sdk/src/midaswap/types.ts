export type OrderParams = {
  pair: string;
  // Only relevant for listings
  tokenX: string; // nft collection address
  tokenId?: string;
  amount?: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
