import crypto from "crypto";
import stringify from "json-stable-stringify";

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling (both for the
// indexer and for the client), the id of any particular token set should
// be a deterministic identifier based on the composition of the token
// set.

export type TokenSetInfo = {
  id: string;
  label: {
    kind: "token" | "collection";
    data: any;
  };
  labelHash: string;
};

export const generateSingleTokenInfo = (contract: string, tokenId: string) => {
  const label: any = {
    kind: "token",
    data: {
      contract,
      tokenId,
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  return {
    id: `token:${contract}:${tokenId}`,
    label,
    labelHash,
  };
};

export const generateCollectionInfo = (
  collection: string,
  contract: string,
  startTokenId: string,
  endTokenId: string
) => {
  const label: any = {
    kind: "collection",
    data: {
      collection,
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  return {
    id: `range:${contract}:${startTokenId}:${endTokenId}`,
    label,
    labelHash,
  };
};
