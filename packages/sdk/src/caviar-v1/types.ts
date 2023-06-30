export type OrderParams = {
  pool: string;
  tokenId?: string;
  extra: {
    prices: string[];
  };
};
