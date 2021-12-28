import * as Sdk from "@reservoir0x/sdk";
import {
  BaseBuilder,
  BaseBuildParams,
} from "@reservoir0x/sdk/dist/wyvern-v2/builders/base";

import { db } from "@/common/db";
import { config } from "@/config/index";

export type BuildOrderOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  // TODO: Add support for attribute-based orders
  maker: string;
  side: "buy" | "sell";
  price: string;
  fee: number;
  feeRecipient: string;
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
};

export const buildOrder = async (options: BuildOrderOptions) => {
  try {
    const buildParams: BaseBuildParams = {
      maker: options.maker,
      side: options.side,
      price: options.price,
      paymentToken:
        options.side === "buy"
          ? Sdk.Common.Addresses.Weth[config.chainId]
          : Sdk.Common.Addresses.Eth[config.chainId],
      fee: options.fee,
      feeRecipient: options.feeRecipient,
      listingTime: options.listingTime,
      expirationTime: options.expirationTime,
      salt: options.salt,
    };

    let builder: BaseBuilder | undefined;
    if (options.contract && options.tokenId) {
      const { contract, tokenId } = options;

      const data = await db.oneOrNone(
        `
          select "c"."kind" from "tokens" "t"
          join "contracts" "c"
            on "t"."contract" = "c"."address"
          where "t"."contract" = $/contract/
            and "t"."token_id" = $/tokenId/
        `,
        { contract, tokenId }
      );

      (buildParams as any).contract = contract;
      (buildParams as any).tokenId = tokenId;

      if (data.kind === "erc721") {
        builder = new Sdk.WyvernV2.Builders.Erc721.SingleToken(config.chainId);
      } else if (data.kind === "erc1155") {
        builder = new Sdk.WyvernV2.Builders.Erc1155.SingleToken(config.chainId);
      }
    } else if (options.collection) {
      const { collection } = options;

      const data = await db.oneOrNone(
        `
          select
            "co"."kind",
            "cl"."contract",
            lower("cl"."token_id_range") as "start_token_id",
            upper("cl"."token_id_range") as "end_token_id"
          from "collections" "cl"
          join "contracts" "co"
            on "cl"."contract" = "co"."address"
          where "cl"."id" = $/collection/
        `,
        { collection }
      );

      if (data.contract && data.start_token_id && data.end_token_id) {
        // Collection is a range of tokens within a contract

        (buildParams as any).contract = data.contract;
        (buildParams as any).startTokenId = data.start_token_id;
        (buildParams as any).endTokenId = data.end_token_id;

        if (data.kind === "erc721") {
          builder = new Sdk.WyvernV2.Builders.Erc721.TokenRange(config.chainId);
        } else if (data.kind === "erc1155") {
          builder = new Sdk.WyvernV2.Builders.Erc1155.TokenRange(
            config.chainId
          );
        }
      } else if (data.contract) {
        // Collection is a full contract

        (buildParams as any).contract = data.contract;

        if (data.kind === "erc721") {
          builder = new Sdk.WyvernV2.Builders.Erc721.ContractWide(
            config.chainId
          );
        } else if (data.kind === "erc1155") {
          builder = new Sdk.WyvernV2.Builders.Erc1155.ContractWide(
            config.chainId
          );
        }
      }
    }

    return builder?.build(buildParams);
  } catch {
    return undefined;
  }
};
