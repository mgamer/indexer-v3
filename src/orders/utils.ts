import crypto from "crypto";
import stringify from "json-stable-stringify";

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling (both for the
// indexer and for the client), the id of any particular token set should
// be a deterministic identifier based on the composition of the token
// set. For now, we support two types of sets:
// - single token sets
// - token range sets

export type TokenSetInfo = {
  id: string;
  label: {
    kind: "token" | "range";
    data: any;
  };
  labelHash: string;
};

export const generateSingleTokenSetInfo = (
  contract: string,
  tokenId: string
) => {
  const kind = "token";
  const label: any = {
    kind,
    data: {
      contract,
      tokenId,
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  return {
    id: `${kind}:${contract}:${tokenId}`,
    label,
    labelHash,
  };
};

export const generateTokenRangeSetInfo = (
  collection: string,
  contract: string,
  startTokenId: string,
  endTokenId: string
) => {
  const kind = "range";
  const label: any = {
    kind,
    data: {
      collection,
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  return {
    id: `${kind}:${contract}:${startTokenId}:${endTokenId}`,
    label,
    labelHash,
  };
};
