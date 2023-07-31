import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as midaswap from "@/utils/midaswap";
import PairAbi from "@reservoir0x/sdk/dist/midaswap/abis/Pair.json";

// type Price = {
//   price: string;
//   bin: number;
//   lpTokenId: string;
// };

export type OrderInfo = {
  orderParams: {
    pool: string;
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
    // Misc options
    forceRecheck?: boolean;

    eventName?: string;
    lpTokenId?: string;
    nftId?: string;
    binLower?: number;
    binstep?: number;
    binAmount?: number;
    tradeBin?: number;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  txTimestamp: number;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

export const getOrderId = (pool: string, lpTokenId: string, tokenId?: string) =>
  tokenId
    ? keccak256(
        ["string", "address", "string", "string", "string"],
        ["midaswap", pool, "sell", lpTokenId, tokenId]
      )
    : keccak256(["string", "address", "string", "string"], ["midaswap", pool, "buy", lpTokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await midaswap.getPoolDetails(orderParams.pool);

      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      if (pool.token !== Sdk.Common.Addresses.WNative[config.chainId]) {
        throw new Error("Unsupported currency");
      }

      const { binAmount, binLower, binstep, nftId, lpTokenId, tradeBin } = orderParams;
      const pairContract = new Contract(pool.address, PairAbi, baseProvider);
      const [, floorPriceBin] = await pairContract.getIDs();

      // Handle: fees
      const feeBps = pool.freeRateBps;
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [
        {
          kind: "marketplace",
          recipient: pool.address,
          bps: pool.freeRateBps,
        },
      ];

      // create buy orders
      const newOrders = async (tokenId?: string) => {
        if (!lpTokenId || !binAmount || !binLower || !binstep) {
          return;
        }

        const id = getOrderId(orderParams.pool, lpTokenId, tokenId);

        // Handle: token set
        const schemaHash = generateSchemaHash();
        const [{ id: tokenSetId }] = tokenId
          ? await tokenSet.singleToken.save([
              {
                id: `token:${pool.nft}:${tokenId}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
                tokenId,
              },
            ])
          : await tokenSet.contractWide.save([
              {
                id: `contract:${pool.nft}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
              },
            ]);

        if (!tokenSetId) {
          throw new Error("No token set available");
        }

        const bins = tokenId
          ? Array.from({ length: binAmount }).map((_, index) => binLower + index * binstep)
          : Array.from({ length: binAmount })
              .map((_, index) => binLower + index * binstep)
              .reverse();

        const price = tokenId
          ? Sdk.Midaswap.Order.getSellPrice(bins[0], pool.freeRateBps, pool.royaltyBps)
          : Sdk.Midaswap.Order.getBuyPrice(bins[0], pool.freeRateBps, pool.royaltyBps);
        const value = price;

        // Handle: core sdk order
        const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
          pair: pool.address,
          tokenX: pool.nft,
          tokenY: pool.token,
          tokenId,
          lpTokenId,
          pool: `${orderParams.pool}_${lpTokenId}`,
          extra: {
            prices: bins.map((bin) =>
              tokenId
                ? Sdk.Midaswap.Order.getSellPrice(bin, pool.freeRateBps, pool.royaltyBps)
                : Sdk.Midaswap.Order.getBuyPrice(bins[0], pool.freeRateBps, pool.royaltyBps)
            ),
            bins,
            lpTokenIds: bins.map(() => lpTokenId),
            floorPriceBin,
          },
        });

        // Handle: source
        const sources = await Sources.getInstance();
        const source = await sources.getOrInsert("midaswap.org");

        const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
        const validTo = `'Infinity'`;

        orderValues.push({
          id,
          kind: "midaswap",
          side: tokenId ? "sell" : "buy",
          fillability_status: "fillable",
          approval_status: "approved",
          token_set_id: tokenSetId,
          token_set_schema_hash: toBuffer(schemaHash),
          maker: toBuffer(pool.address),
          taker: toBuffer(AddressZero),
          price: price.toString(),
          value: value.toString(),
          currency: toBuffer(pool.token),
          currency_price: price.toString(),
          currency_value: value.toString(),
          needs_conversion: null,
          quantity_remaining: "1",
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: null,
          contract: toBuffer(pool.nft),
          conduit: null,
          fee_bps: feeBps,
          fee_breakdown: feeBreakdown,
          dynamic: null,
          raw_data: sdkOrder.params,
          expiration: validTo,
          missing_royalties: null,
          normalized_value: null,
          currency_normalized_value: null,
          block_number: orderParams.txBlock ?? null,
          log_index: orderParams.logIndex ?? null,
        });

        results.push({
          id,
          txHash: orderParams.txHash,
          txTimestamp: orderParams.txTimestamp,
          status: "success",
          triggerKind: "new-order",
        });
      };

      if (tradeBin) {
        // Sell/Buy
      } else if (binAmount) {
        // add nft/add ft
        await newOrders(nftId);
      } else {
        // remove
      }
    } catch (error) {
      logger.error(
        "orders-midaswap-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

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
        "currency",
        "currency_price",
        "currency_value",
        "needs_conversion",
        "quantity_remaining",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id_int",
        "is_reservoir",
        "contract",
        "fee_bps",
        { name: "fee_breakdown", mod: ":json" },
        "dynamic",
        "raw_data",
        { name: "expiration", mod: ":raw" },
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
        "block_number",
        "log_index",
      ],
      {
        table: "orders",
      }
    );
    try {
      await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
    } catch (error) {
      logger.error(
        "orders-midaswap-save",
        `Failed to handle order with params ${JSON.stringify(error)}: ${error}`
      );
    }
  }

  await orderUpdatesByIdJob.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, txTimestamp, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
              txHash: txHash,
              txTimestamp: txTimestamp,
            },
          } as OrderUpdatesByIdJobPayload)
      )
  );

  return results;
};
