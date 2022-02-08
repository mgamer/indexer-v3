import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { db, pgp } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { OrderMetadata, defaultSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

export type OrderInfo = {
  order: Sdk.WyvernV2.Order;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: any[] = [];

  const handleOrder = async ({ order, metadata }: OrderInfo) => {
    try {
      const id = order.prefixHash();

      // Check: order doesn't already exist
      const orderExists = await db.oneOrNone(
        `SELECT 1 FROM "orders" "o" WHERE "o"."id" = $/id/`,
        { id }
      );
      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      // Check: order has a valid target
      const contractKind = order.params.kind?.split("-")[0];
      if (contractKind === "erc721") {
        const contract = new Sdk.Common.Helpers.Erc721(
          baseProvider,
          order.params.target
        );
        if (!(await contract.isValid())) {
          return results.push({
            id,
            status: "invalid-target",
          });
        }
      } else if (contractKind === "erc1155") {
        const contract = new Sdk.Common.Helpers.Erc1155(
          baseProvider,
          order.params.target
        );
        if (!(await contract.isValid())) {
          return results.push({
            id,
            status: "invalid-target",
          });
        }
      } else {
        return results.push({
          id,
          status: "invalid-target",
        });
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Check: order has a valid listing time
      const listingTime = order.params.listingTime;
      if (listingTime >= currentTime) {
        // TODO: Add support for not-yet-valid orders
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.params.expirationTime;
      if (expirationTime !== 0 && currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: order has a non-zero fee recipient
      if (order.params.feeRecipient === AddressZero) {
        return results.push({
          id,
          status: "invalid-fee-recipient",
        });
      }

      // Check: buy order has Weth as payment token
      if (
        order.params.side === 0 &&
        order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        order.params.side === 1 &&
        order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: order is not private
      if (order.params.taker !== AddressZero) {
        return results.push({
          id,
          status: "unsupported-taker",
        });
      }

      // Check: order is valid
      try {
        order.checkValidity();
      } catch {
        return results.push({
          id,
          status: "invalid",
        });
      }

      // Check: order has a valid signature
      try {
        order.checkSignature();
      } catch {
        return results.push({
          id,
          status: "invalid-signature",
        });
      }

      // Check: order is fillable
      try {
        await order.checkFillability(baseProvider);
      } catch {
        return results.push({
          id,
          status: "not-fillable",
        });
      }

      // Check and save: associated token set
      let tokenSetId: string | undefined;
      const schemaHash = metadata.schemaHash || defaultSchemaHash;

      const orderKind = order.params.kind?.split("-").slice(1).join("-");
      switch (orderKind) {
        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${order.params.target}`,
              schemaHash,
              contract: order.params.target,
            },
          ]);

          break;
        }

        case "single-token": {
          let tokenId: string | undefined;
          if (contractKind === "erc721") {
            tokenId = new Sdk.WyvernV2.Builders.Erc721.SingleToken(
              config.chainId
            ).getTokenId(order);
          } else if (contractKind === "erc1155") {
            tokenId = new Sdk.WyvernV2.Builders.Erc1155.SingleToken(
              config.chainId
            ).getTokenId(order);
          }

          if (tokenId) {
            [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${order.params.target}`,
                schemaHash,
                contract: order.params.target,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "token-list": {
          let merkleRoot: string | undefined;
          if (contractKind === "erc721") {
            merkleRoot = new Sdk.WyvernV2.Builders.Erc721.TokenList(
              config.chainId
            ).getMerkleRoot(order);
          } else if (contractKind === "erc1155") {
            merkleRoot = new Sdk.WyvernV2.Builders.Erc721.TokenList(
              config.chainId
            ).getMerkleRoot(order);
          }

          if (merkleRoot) {
            // Skip saving the token set since we don't know the underlying tokens
            tokenSetId = `list:${order.params.target}:${merkleRoot}`;
          }

          break;
        }

        case "token-range": {
          let tokenIdRange: [string, string] | undefined;
          if (contractKind === "erc721") {
            tokenIdRange = new Sdk.WyvernV2.Builders.Erc721.TokenRange(
              config.chainId
            ).getTokenIdRange(order);
          } else if (contractKind === "erc1155") {
            tokenIdRange = new Sdk.WyvernV2.Builders.Erc1155.TokenRange(
              config.chainId
            ).getTokenIdRange(order);
          }

          if (tokenIdRange) {
            [{ id: tokenSetId }] = await tokenSet.tokenRange.save([
              {
                id: `token:${order.params.target}`,
                schemaHash,
                contract: order.params.target,
                startTokenId: tokenIdRange[0],
                endTokenId: tokenIdRange[1],
              },
            ]);
          }

          break;
        }
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      const side = order.params.side === 0 ? "buy" : "sell";

      // Handle: price and value
      let value: string;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        const fee = order.params.takerRelayerFee;
        value = bn(order.params.basePrice)
          .sub(bn(order.params.basePrice).mul(bn(fee)).div(10000))
          .toString();
      } else {
        // For sell orders, the value is the same as the price
        value = order.params.basePrice;
      }

      // Handle: fees
      const feeBps = Math.max(
        order.params.makerRelayerFee,
        order.params.takerRelayerFee
      );

      let sourceInfo: any;
      switch (order.params.feeRecipient) {
        // OpenSea
        case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": {
          sourceInfo = {
            id: "opensea",
            bps: 250,
          };
          break;
        }

        // Unknown
        default: {
          sourceInfo = {
            id: "unknown",
            bps: feeBps,
          };
          break;
        }
      }

      orderValues.push({
        id,
        kind: "wyvern-v2",
        side,
        fillability_status: "fillable",
        approval_status: "approved",
        token_set_id: tokenSetId,
        token_set_schema_hash: schemaHash,
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price: order.params.basePrice,
        value,
        valid_between: `
          tstzrange(
            date_trunc('seconds', to_timestamp(${order.params.listingTime})),
            date_trunc('seconds', to_timestamp(${
              order.params.expirationTime || "infinity"
            })),
            '[]'
        `,
        source_info: sourceInfo,
        raw_data: order.params,
        expiration: `
          date_trunc('seconds', to_timestamp(${
            order.params.expirationTime || "infinity"
          }))
        `,
      });

      results.push({ id, status: "success" });
    } catch {
      // Ignore any failures
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(
    orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo)))
  );

  if (orderValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "id",
        "kind",
        "side",
        "fillability_status",
        "approval_status",
        "token_set_id",
        "token_set_schema_hash",
        "maker",
        "taker",
        "price",
        "value",
        "valid_between",
        "source_info",
        "raw_data",
        "expiration",
        { name: "created_at", init: () => "now()", mod: ":raw" },
        { name: "updated_at", init: () => "now()", mod: ":raw" },
      ],
      {
        table: "orders",
      }
    );
    await db.none(
      pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING"
    );
  }

  return results;
};
