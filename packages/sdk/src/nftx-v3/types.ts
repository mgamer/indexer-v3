export type OrderParams = {
  vaultId: string;
  collection: string;
  currency?: string;
  idsIn?: string[];
  amounts?: string[];
  price: string;
  executeCallData: string;
  deductRoyalty: boolean;
  idsOut?: string[];
  vTokenPremiumLimit?: string;
};
