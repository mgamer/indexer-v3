import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { OrderMetadata, defaultSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

export type OrderInfo = {
  orderParams: Sdk.WyvernV2.Types.OrderParams;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
};

// TODO: This definitely needs to get moved into the SDK. We should
// also refactor the SDK so that the clients are as abstracted away
// as possible from the underlying order formats.
const getOrderTarget = (order: Sdk.WyvernV2.Order): string | undefined => {
  try {
    if (order.params.kind?.endsWith("single-token-v2")) {
      if (order.params.kind?.startsWith("erc721")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc721.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      } else if (order.params.kind?.startsWith("erc1155")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc1155.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      }
    } else {
      return order.params.target;
    }
  } catch {
    return undefined;
  }
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: any[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.WyvernV2.Order(config.chainId, orderParams);
      const target = getOrderTarget(order);
      const id = order.prefixHash();

      // Check: order has a valid target
      if (!target) {
        return results.push({
          id,
          status: "unknown-target",
        });
      }

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
      // TODO: For efficiency, first check the database for the contract's
      // kind and in case that's missing use on-chain cals to check
      const contractKind = order.params.kind?.split("-")[0];
      if (contractKind === "erc721") {
        const contract = new Sdk.Common.Helpers.Erc721(baseProvider, target);
        if (!(await contract.isValid())) {
          return results.push({
            id,
            status: "invalid-target",
          });
        }
      } else if (contractKind === "erc1155") {
        const contract = new Sdk.Common.Helpers.Erc1155(baseProvider, target);
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

      // Check: fillability and approval status
      let fillabilityStatus = "fillable";
      let approvalStatus = "approved";
      try {
        await order.checkFillability(baseProvider);
      } catch (error: any) {
        // Keep any orders that can potentially get valid in the future
        if (error.message === "no-approval") {
          approvalStatus = "no-approval";
        } else if (error.message === "no-balance") {
          fillabilityStatus = "no-balance";
        } else {
          return results.push({
            id,
            status: "not-fillable",
          });
        }
      }

      // Check and save: associated token set
      let tokenSetId: string | undefined;
      const schemaHash = metadata.schemaHash || defaultSchemaHash;

      const orderKind = order.params.kind?.split("-").slice(1).join("-");
      switch (orderKind) {
        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${target}`,
              schemaHash,
              contract: target,
            },
          ]);

          break;
        }

        case "single-token": {
          let tokenId: string | undefined;
          if (contractKind === "erc721") {
            tokenId = new Sdk.WyvernV2.Builders.Erc721.SingleToken.V1(
              config.chainId
            ).getTokenId(order);
          } else if (contractKind === "erc1155") {
            tokenId = new Sdk.WyvernV2.Builders.Erc1155.SingleToken.V1(
              config.chainId
            ).getTokenId(order);
          }

          if (tokenId) {
            [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${target}:${tokenId}`,
                schemaHash,
                contract: target,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "single-token-v2": {
          let tokenId: string | undefined;
          if (contractKind === "erc721") {
            ({ tokenId } = new Sdk.WyvernV2.Builders.Erc721.SingleToken.V2(
              config.chainId
            ).getDetails(order)!);
          } else if (contractKind === "erc1155") {
            ({ tokenId } = new Sdk.WyvernV2.Builders.Erc1155.SingleToken.V2(
              config.chainId
            ).getDetails(order)!);
          }

          if (tokenId) {
            [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${target}:${tokenId}`,
                schemaHash,
                contract: target,
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
            tokenSetId = `list:${target}:${merkleRoot}`;
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
                id: `range:${target}:${tokenIdRange[0]}:${tokenIdRange[1]}`,
                schemaHash,
                contract: target,
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

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.listingTime}))`;
      const validTo = order.params.expirationTime
        ? `date_trunc('seconds', to_timestamp(${order.params.expirationTime}))`
        : "'infinity'";
      orderValues.push({
        id,
        kind: "wyvern-v2",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price: order.params.basePrice,
        value,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        source_info: sourceInfo,
        raw_data: order.params,
        expiration: validTo,
      });

      results.push({ id, status: "success" });
    } catch (error) {
      logger.error(
        "orders-wyvern-v2-save",
        `Failed to handle order with params ${JSON.stringify(
          orderParams
        )}: ${error}`
      );
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
        { name: "valid_between", mod: ":raw" },
        "source_info",
        "raw_data",
        { name: "expiration", mod: ":raw" },
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

    await ordersUpdateById.addToQueue(
      results
        .filter((r) => r.status === "success")
        .map(({ id }) => ({
          context: "new-order",
          id,
        }))
    );
  }

  return results;
};
