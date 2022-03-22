import { HashZero } from "@ethersproject/constants";
import crypto from "crypto";
import stringify from "json-stable-stringify";

import { config } from "@/config/index";

// Optional metadata associated to an order
export type OrderMetadata = {
  // For now, only attribute orders will have an associated schema.
  // The other order kinds only have a single possible schema that
  // can be attached to them:
  // - single-token -> order on a single token
  // - token-range / contract-wide -> order on a full collection
  schema?: {
    kind: "attribute";
    data: {
      collection: string;
      attributes: [
        {
          key: string;
          value: string;
        }
      ];
    };
  };
  schemaHash?: string;
  source?: string;
};

const defaultSchemaHash = HashZero;
export const generateSchemaHash = (schema?: object) =>
  schema
    ? "0x" + crypto.createHash("sha256").update(stringify(schema)).digest("hex")
    : defaultSchemaHash;

// For now, we hardcode the order's source metadata
export const getOrderSourceMetadata = (
  sourceId: string | null,
  contract: string,
  tokenId: string
) => {
  switch (sourceId) {
    // opensea.io
    case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": {
      return {
        id: sourceId,
        name: "OpenSea",
        icon: "https://opensea.io/static/images/logos/opensea.svg",
        url:
          config.chainId === 1
            ? `https://opensea.io/assets/${contract}/${tokenId}`
            : `https://testnets.opensea.io/assets/${contract}/${tokenId}`,
      };
    }

    // forgotten.market
    case "0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4": {
      return {
        id: sourceId,
        name: "Forgotten Market",
        icon: "https://forgotten.market/static/img/favicon.ico",
        url: `https://forgotten.market/${contract}/${tokenId}`,
      };
    }

    // Unknown
    default: {
      return {
        id: sourceId,
        name: "Unknown",
        icon: null,
        url: null,
      };
    }
  }
};

// Underlying database model for an order
export type DbOrder = {
  id: string;
  kind: "wyvern-v2.3";
  side: "buy" | "sell";
  fillability_status: string;
  approval_status: string;
  token_set_id: string;
  token_set_schema_hash: Buffer;
  maker: Buffer;
  taker: Buffer;
  price: string;
  value: string;
  valid_between: string;
  nonce: string;
  source_id: Buffer | null;
  contract: Buffer;
  fee_bps: number;
  fee_breakdown: object | null;
  raw_data: object;
  expiration: string;
};
