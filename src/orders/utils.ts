import hash from "object-hash";

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling (both for the
// indexer and for the client), the id of any particular token set should
// be a deterministic identifier based on set composition. For now, we
// support two types of sets:
// - single token sets
// - token range sets

export type TokenSetInfo = {
  id: string;
  label: any;
  labelHash: string;
};

export const generateSingleTokenSetInfo = (
  contract: string,
  tokenId: string
) => {
  const label: any = {
    kind: "single-token",
    data: {
      contract,
      tokenId,
    },
  };
  return {
    id: `token:${contract}:${tokenId}`,
    label,
    labelHash: `0x${hash(label)}`,
  };
};

export const generateTokenRangeSetInfo = (
  collection: string,
  contract: string,
  startTokenId: string,
  endTokenId: string
) => {
  const label: any = {
    kind: "token-range",
    data: {
      contract,
      startTokenId,
      endTokenId,
      collection,
    },
  };
  return {
    id: `range:${contract}:${startTokenId}:${endTokenId}`,
    label,
    labelHash: `0x${hash(label)}`,
  };
};
