import crypto from "crypto";
import stringify from "json-stable-stringify";

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling (both for the
// indexer and for the client), the id of any particular token set should
// be a deterministic identifier based on the composition of the set.

export type TokenSetLabelKind = "token" | "collection" | "attribute";

export type TokenSetInfo = {
  // Token set ids have one of the following formats:
  // - `token:${contract}:${tokenId}`
  // - `range:${contract}:${startTokenId}:${endTokenId}`
  // - `contract:${contract}`
  // - `list:${merkleRoot}`
  id: string;
  label: {
    kind: TokenSetLabelKind;
    // Each label kind's data as a specific schema
    data: any;
  };
  // Deterministic hash of the label json
  labelHash: string;
};

export const generateTokenInfo = (contract: string, tokenId: string) => {
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
  tokenIdRange?: [string, string]
) => {
  const label: any = {
    kind: "collection",
    data: {
      collection,
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  if (tokenIdRange) {
    return {
      id: `range:${contract}:${tokenIdRange[0]}:${tokenIdRange[1]}`,
      label,
      labelHash,
    };
  } else {
    return {
      id: `contract:${contract}`,
      label,
      labelHash,
    };
  }
};

export const generateAttributeInfo = (
  attribute: {
    collection: string;
    key: string;
    value: string;
  },
  merkleRoot: string
) => {
  const label: any = {
    kind: "attribute",
    data: {
      collection: attribute.collection,
      attribute: {
        key: attribute.key,
        value: attribute.value,
      },
    },
  };
  const labelHash =
    "0x" + crypto.createHash("sha256").update(stringify(label)).digest("hex");

  return {
    id: `list:${merkleRoot}`,
    label,
    labelHash,
  };
};
