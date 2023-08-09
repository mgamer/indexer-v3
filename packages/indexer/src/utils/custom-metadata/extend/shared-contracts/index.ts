/* eslint-disable @typescript-eslint/no-explicit-any */

export const extendCollection = async (_chainId: number, metadata: any, _tokenId = null) => {
  return {
    ...metadata,
    royalties: [],
  };
};
