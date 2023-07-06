import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as midaswap from "@/utils/midaswap";

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
    // tokenX: string;
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

export const getOrderId = (pool: string, side: "sell" | "buy", tokenId?: string) =>
  side === "buy"
    ? // Buy orders have a single order id per pool
      keccak256(["string", "address", "string"], ["midaswap", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["midaswap", pool, side, tokenId]);

const getBuyOrderId = (pool: string, lpTokenId: string, index: number) =>
  keccak256(
    ["string", "address", "string", "string", "uint256"],
    ["midaswap", pool, "buy", lpTokenId, index]
  );

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const pool = await midaswap.getPoolDetails(orderParams.pool);

      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      if (pool.token !== Sdk.Common.Addresses.Weth[config.chainId]) {
        throw new Error("Unsupported currency");
      }

      const { binAmount, binLower, binstep, nftId, lpTokenId } = metadata;

      // Force recheck at most once per hour
      // const recheckCondition = orderParams.forceRecheck
      //   ? `AND orders.updated_at < to_timestamp(${orderParams.txTimestamp - 3600})`
      //   : `AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})`;

      // Handle: fees
      const feeBps = 50;
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [
        {
          kind: "marketplace",
          recipient: pool.address,
          bps: 50,
        },
      ];

      switch (metadata.eventName) {
        // Handle sell orders
        case "midaswap-erc721-deposit": {
          if (
            _.isUndefined(binAmount) ||
            _.isUndefined(binLower) ||
            _.isUndefined(binstep) ||
            _.isUndefined(lpTokenId) ||
            _.isUndefined(nftId)
          ) {
            return;
          }

          const id = getOrderId(orderParams.pool, "sell", metadata.nftId);

          const tmpPriceList = Array.from({ length: binAmount }).map(
            (item, index) => binLower + index * binstep
          );

          const price = tmpPriceList[0];
          const value = tmpPriceList[0];

          // Handle: core sdk order
          const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
            pair: orderParams.pool,
            tokenX: pool.nft,
            tokenId: nftId,
            lpTokenId,
            extra: {
              prices: tmpPriceList.map((bin) => ({
                price: bin.toString(),
                bin: bin.toString(),
                lpTokenId,
              })),
            },
          });

          const orderResult = await redb.oneOrNone(
            `
                      SELECT 1 FROM orders
                      WHERE orders.id = $/id/
                    `,
            { id }
          );

          if (!orderResult) {
            // Handle: token set
            const schemaHash = generateSchemaHash();
            const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${pool.nft}:${nftId}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
                tokenId: nftId,
              },
            ]);
            if (!tokenSetId) {
              throw new Error("No token set available");
            }

            // Handle: source
            const sources = await Sources.getInstance();
            const source = await sources.getOrInsert("midaswap");

            const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
            const validTo = `'Infinity'`;
            orderValues.push({
              id,
              kind: "midaswap",
              side: "sell",
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
          }

          break;
        }

        // Handle buy orders
        case "midaswap-erc20-deposit": {
          if (
            _.isUndefined(binAmount) ||
            _.isUndefined(binLower) ||
            _.isUndefined(binstep) ||
            _.isUndefined(lpTokenId)
          ) {
            return;
          }

          const orderResult = await redb.manyOrNone(
            `
                      SELECT id,raw_data FROM orders
                      WHERE orders.maker = $/maker/ AND orders.side = 'buy'
                    `,
            {
              maker: toBuffer(pool.address),
            }
          );

          const tmpPriceList = Array.from({ length: binAmount })
            .map((item, index) => binLower + index * binstep)
            .reverse();
          const price = tmpPriceList[0];
          const value = tmpPriceList[0];
          const prices = tmpPriceList.map((bin) => ({
            price: bin.toString(),
            bin: bin.toString(),
            lpTokenId,
          }));

          // Handle: core sdk order
          const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
            pair: orderParams.pool,
            tokenX: pool.nft,
            // tokenId: nftId,
            lpTokenId,
            extra: {
              prices: !orderResult.length
                ? prices
                : _.sortBy(prices.concat(orderResult[0].raw_data.extra.prices), "price").reverse(),
            },
          });

          // create buy orders
          const newBuyOrders = async () => {
            // Handle: token set
            const schemaHash = generateSchemaHash();
            const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
              {
                id: `contract:${pool.nft}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
              },
            ]);

            if (!tokenSetId) {
              throw new Error("No token set available");
            }

            // Handle: source
            const sources = await Sources.getInstance();
            const source = await sources.getOrInsert("midaswap");

            const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
            const validTo = `'Infinity'`;
            tmpPriceList.forEach((item, index) => {
              orderValues.push({
                id: getBuyOrderId(pool.address, lpTokenId, index),
                kind: "midaswap",
                side: "buy",
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
                id: getBuyOrderId(pool.address, lpTokenId, index),
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "success",
                triggerKind: "new-order",
              });
            });
          };

          if (!orderResult) {
            await newBuyOrders();
          } else {
            await newBuyOrders();

            orderResult.forEach(async (item) => {
              // update already exist buy orders
              await idb.none(
                `
                  UPDATE orders SET
                    fillability_status = 'fillable',
                    approval_status = 'approved',
                    price = $/price/,
                    currency_price = $/price/,
                    value = $/value/,
                    currency_value = $/value/,
                    valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                    updated_at = now(),
                    raw_data = $/rawData:json/,
                    log_index = $/logIndex/
                  WHERE orders.id = $/id/
                `,
                {
                  id: item.id,
                  price,
                  value,
                  rawData: {
                    ...sdkOrder.params,
                    lpTokenId: item.raw_data.lpTokenId,
                  },
                  quantityRemaining: prices.length.toString(),
                  blockNumber: orderParams.txBlock,
                  logIndex: orderParams.logIndex,
                }
              );
              results.push({
                id: item.id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "success",
                triggerKind: "reprice",
              });
            });
          }
          break;
        }

        // Handle remove orders
        case "midaswap-position-burned": {
          const orderResult = await redb.manyOrNone(
            `
                      SELECT id,side,raw_data FROM orders
                      WHERE orders.maker = $/maker/
                    `,
            {
              maker: toBuffer(pool.address),
            }
          );

          if (orderResult.length) {
            // remove orders by pool && lp token id
            const ids = orderResult
              .filter((item) => item.raw_data.lpTokenId === lpTokenId)
              .map((item) => item.id);
            if (ids.length) {
              await idb.none(`DELETE FROM orders WHERE orders.id IN ($/ids:list/)`, {
                ids,
              });
            }

            const firstBuyOrder = orderResult.find((item) => item.side === "buy");

            if (!firstBuyOrder) {
              return;
            }

            const prices = _.remove(
              firstBuyOrder.raw_data.extra.prices,
              (item: Sdk.Midaswap.Price) => item.lpTokenId !== lpTokenId
            );

            if (!prices.length) {
              return;
            }

            const price = prices[0].price;
            const value = prices[0].price;

            // update buy orders price
            orderResult
              .filter((item) => item.side === "buy")
              .forEach(async (item) => {
                await idb.none(
                  `
                  UPDATE orders SET
                    fillability_status = 'fillable',
                    approval_status = 'approved',
                    price = $/price/,
                    currency_price = $/price/,
                    value = $/value/,
                    currency_value = $/value/,
                    valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                    updated_at = now(),
                    raw_data = $/rawData:json/,
                    log_index = $/logIndex/
                  WHERE orders.id = $/id/
                `,
                  {
                    id: item.id,
                    price,
                    value,
                    rawData: {
                      ...item.raw_data,
                      extra: {
                        prices,
                      },
                    },
                    quantityRemaining: prices.length.toString(),
                    blockNumber: orderParams.txBlock,
                    logIndex: orderParams.logIndex,
                  }
                );
              });
          }

          break;
        }
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

  await ordersUpdateById.addToQueue(
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
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
