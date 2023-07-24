export type Price = {
  bin: string;
  price: string;
  lpTokenId: string;
};

export type OrderParams = {
  pair: string;
  // Only relevant for listings
  tokenX: string; // nft collection address
  tokenY: string; // ft address
  lpTokenId: string;
  pool: string; // ${pair}_${lpTokenId}
  tokenId?: string;
  amount?: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: Price[];
  };
};
