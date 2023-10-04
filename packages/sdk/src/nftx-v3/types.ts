export type OrderParams = {
  vaultId: string;
  pool: string;
  collection: string;
  userAddress: string;
  idsIn?: string[];
  idsOut?: string[];
  amounts?: string[];
  path: string[];
  executeCallData: string;
  vTokenPremiumLimit?: string;
  deductRoyalty: string;
  currency?: string;
  price: string;
  extra: {
    prices: string[];
  };
};
