import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";
import { randomUUID } from "crypto";
import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
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
import { baseProvider } from "@/common/provider";
import { Contract } from "@ethersproject/contracts";

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

export const getSellOrderId = (pool: string, tokenId: string, lpTokenId: string) =>
  keccak256(
    ["string", "address", "string", "uint256", "string"],
    ["midaswap", pool, "sell", tokenId, lpTokenId]
  );

const getBuyOrderId = (pool: string, lpTokenId: string, uuid: string) =>
  keccak256(
    ["string", "address", "string", "string", "string"],
    ["midaswap", pool, "buy", lpTokenId, uuid]
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

      const { binAmount, binLower, binstep, nftId, lpTokenId, tradeBin } = metadata;

      // Force recheck at most once per hour
      // const recheckCondition = orderParams.forceRecheck
      //   ? `AND orders.updated_at < to_timestamp(${orderParams.txTimestamp - 3600})`
      //   : `AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})`;

      // Handle: fees
      const feeBps = +pool.freeRate;
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [
        {
          kind: "marketplace",
          recipient: pool.address,
          bps: +pool.freeRate,
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

          const id = getSellOrderId(orderParams.pool, nftId, lpTokenId);

          const tmpPriceList = Array.from({ length: binAmount }).map(
            (item, index) => binLower + index * binstep
          );

          const price = Sdk.Midaswap.Order.getSellPrice(
            tmpPriceList[0],
            +pool.freeRate,
            +pool.roralty
          );
          const value = price;

          // Handle: core sdk order
          const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
            pair: orderParams.pool,
            tokenX: pool.nft,
            tokenY: pool.token,
            tokenId: nftId,
            lpTokenId,
            extra: {
              prices: tmpPriceList.map((bin) => ({
                price: Sdk.Midaswap.Order.getSellPrice(bin, +pool.freeRate, +pool.roralty),
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

          const price = Sdk.Midaswap.Order.getBuyPrice(
            tmpPriceList[0],
            +pool.freeRate,
            +pool.roralty
          );
          const value = price;

          const prices = tmpPriceList.map((bin) => ({
            price: Sdk.Midaswap.Order.getBuyPrice(bin, +pool.freeRate, +pool.roralty),
            bin: bin.toString(),
            lpTokenId,
          }));

          // Handle: core sdk order
          const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
            pair: orderParams.pool,
            tokenX: pool.nft,
            tokenY: pool.token,
            // tokenId: nftId,
            lpTokenId,
            extra: {
              prices: !orderResult.length
                ? prices
                : _.sortBy(prices.concat(orderResult[0].raw_data.extra.prices), "bin").reverse(),
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
            tmpPriceList.forEach(() => {
              const id = getBuyOrderId(pool.address, lpTokenId, randomUUID());
              orderValues.push({
                id,
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
                id,
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
                      SELECT id,side,fillability_status,raw_data FROM orders
                      WHERE orders.maker = $/maker/
                    `,
            {
              maker: toBuffer(pool.address),
            }
          );

          if (orderResult.length) {
            // remove sell/buy orders by pool && lp token id
            const ids = orderResult
              .filter((item) => item.raw_data.lpTokenId === lpTokenId)
              .map((item) => item.id);
            if (ids.length) {
              await idb.none(`DELETE FROM orders WHERE orders.id IN ($/ids:list/)`, {
                ids,
              });
            }

            // update the rest fillable buy orders price
            const firstBuyOrder = orderResult.find(
              (item) => item.side === "buy" && item.fillability_status === "fillable"
            );

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

            orderResult
              .filter((item) => item.side === "buy" && item.fillability_status === "fillable")
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
        case "midaswap-buy-erc721": {
          if (_.isUndefined(tradeBin) || _.isUndefined(lpTokenId) || _.isUndefined(nftId)) {
            return;
          }

          const id = getSellOrderId(orderParams.pool, nftId, lpTokenId);

          // delete sell order
          await idb.none(`DELETE FROM orders WHERE orders.id = $/id/`, { id });

          const orderResult = await redb.manyOrNone(
            `
                      SELECT id,side,fillability_status,raw_data FROM orders
                      WHERE orders.maker = $/maker/
                    `,
            {
              maker: toBuffer(pool.address),
            }
          );

          const sellOrders = orderResult.filter(
            (item) => item.side === "sell" && item.raw_data.lpTokenId === lpTokenId
          );
          const buyOrders = orderResult.filter((item) => item.side === "buy");

          const fillableBuyOrders = buyOrders.filter(
            (item) => item.fillability_status === "fillable"
          );
          const cancelledOrders = buyOrders.filter(
            (item) => item.fillability_status === "cancelled"
          );

          const pairContract = new Contract(pool.address, Sdk.Midaswap.PairAbi, baseProvider);
          const [, floorPriceBin] = await pairContract.getIDs();

          // fillability_status need to change
          const cancelledToTillableOrders = cancelledOrders.filter(
            (item) => item.raw_data.extra.prices[0].bin <= floorPriceBin
          );

          // Update the sell order with the same lpTokenId
          if (sellOrders.length) {
            const targetPrice = sellOrders[0].raw_data.extra.prices.find(
              (item: Sdk.Midaswap.Price) => item.bin !== tradeBin.toString()
            );

            const newSellPrices: Sdk.Midaswap.Price[] = _.remove(
              sellOrders[0].raw_data.extra.prices,
              (price) => price !== targetPrice
            );

            const price = newSellPrices[0].price;
            const value = newSellPrices[0].price;

            sellOrders.forEach(async (item) => {
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
                      prices: newSellPrices,
                    },
                  },
                  quantityRemaining: sellOrders.length.toString(),
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

          // handler buy orders

          // create buy orders
          const newBuyOrders = async (newBuyPrices: Sdk.Midaswap.Price[]) => {
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

            const price = newBuyPrices[0].price;
            const value = newBuyPrices[0].price;

            // Handle: core sdk order
            const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
              pair: orderParams.pool,
              tokenX: pool.nft,
              tokenY: pool.token,
              // tokenId: nftId,
              lpTokenId,
              extra: {
                prices:
                  +tradeBin <= +floorPriceBin
                    ? newBuyPrices
                    : [
                        {
                          price: Sdk.Midaswap.Order.getBuyPrice(
                            tradeBin,
                            +pool.freeRate,
                            +pool.roralty
                          ),
                          bin: tradeBin.toString(),
                          lpTokenId,
                        },
                      ],
              },
            });

            const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
            const validTo = `'Infinity'`;
            const id = getBuyOrderId(pool.address, lpTokenId, randomUUID());

            orderValues.push({
              id,
              kind: "midaswap",
              side: "buy",
              fillability_status: +tradeBin <= +floorPriceBin ? "fillable" : "cancelled",
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

          const newBuyPrices: Sdk.Midaswap.Price[] = _.sortBy(
            [
              ...(fillableBuyOrders[0]?.raw_data.extra.prices || []), // exist fillable buy order bins
              ...cancelledToTillableOrders.map((item) => item.raw_data.extra.prices[0]), // append cancelled to fillable order bins
              // append new buy order bins
              +tradeBin <= +floorPriceBin
                ? {
                    price: Sdk.Midaswap.Order.getBuyPrice(tradeBin, +pool.freeRate, +pool.roralty),
                    bin: tradeBin.toString(),
                    lpTokenId,
                  }
                : undefined,
            ].filter(Boolean),
            "bin"
          ).reverse();

          const price = newBuyPrices[0]?.price || 0;
          const value = newBuyPrices[0]?.price || 0;

          // update cancelled buy orders price & fillability_status
          if (cancelledToTillableOrders.length) {
            cancelledToTillableOrders.forEach(async (item) => {
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
                      prices: newBuyPrices,
                    },
                  },
                  quantityRemaining: newBuyPrices.length.toString(),
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

          if (fillableBuyOrders.length) {
            await newBuyOrders(newBuyPrices);

            // update fillable buy orders price
            fillableBuyOrders.forEach(async (item) => {
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
                      prices: newBuyPrices,
                    },
                  },
                  quantityRemaining: newBuyPrices.length.toString(),
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
          } else {
            await newBuyOrders(
              _.sortBy(
                [
                  ...cancelledToTillableOrders.map((item) => item.raw_data.extra.prices[0]),
                  {
                    price: Sdk.Midaswap.Order.getBuyPrice(tradeBin, +pool.freeRate, +pool.roralty),
                    bin: tradeBin.toString(),
                    lpTokenId,
                  },
                ],
                "bin"
              ).reverse()
            );
          }

          break;
        }

        case "midaswap-sell-erc721": {
          if (_.isUndefined(tradeBin) || _.isUndefined(lpTokenId) || _.isUndefined(nftId)) {
            return;
          }

          const orderResult = await redb.manyOrNone(
            `
                      SELECT id,side,raw_data FROM orders
                      WHERE orders.maker = $/maker/
                    `,
            {
              maker: toBuffer(pool.address),
            }
          );

          const sellOrders = orderResult.filter(
            (item) => item.side === "sell" && item.raw_data.lpTokenId === lpTokenId
          );
          const buyOrders = orderResult.filter((item) => item.side === "buy");

          if (buyOrders.length) {
            const targetOrder = buyOrders.find((item) => item.raw_data.lpTokenId === lpTokenId);

            if (targetOrder) {
              // delete one order by lp token id
              await idb.none(
                `DELETE FROM orders WHERE orders.maker = $/maker/ AND orders.id = $/id/`,
                {
                  maker: toBuffer(pool.address),
                  id: targetOrder.id,
                }
              );

              const targetPrice = buyOrders[0].raw_data.extra.prices.find(
                (item: Sdk.Midaswap.Price) =>
                  item.lpTokenId === lpTokenId && item.bin === tradeBin.toString()
              );
              const newBuyPrices: Sdk.Midaswap.Price[] = _.remove(
                buyOrders[0].raw_data.extra.prices,
                (item) => item !== targetPrice
              );

              const price = newBuyPrices[0].price;
              const value = newBuyPrices[0].price;
              buyOrders
                .filter((item) => item.id !== targetOrder.id)
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
                          prices: newBuyPrices,
                        },
                      },
                      quantityRemaining: newBuyPrices.length.toString(),
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
          }

          const newSellOrder = async (newSellPrices: Sdk.Midaswap.Price[]) => {
            const id = getSellOrderId(orderParams.pool, nftId, lpTokenId);
            const price = newSellPrices[0].price;
            const value = newSellPrices[0].price;

            // Handle: core sdk order
            const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
              pair: orderParams.pool,
              tokenX: pool.nft,
              tokenY: pool.token,
              tokenId: nftId,
              lpTokenId,
              extra: {
                prices: newSellPrices,
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
          };

          if (sellOrders.length) {
            const newSellPrices: Sdk.Midaswap.Price[] = _.sortBy(
              [
                ...sellOrders[0].raw_data.extra.prices,
                {
                  price: Sdk.Midaswap.Order.getSellPrice(tradeBin, +pool.freeRate, +pool.roralty),
                  bin: tradeBin.toString(),
                  lpTokenId,
                },
              ],
              "bin"
            );

            await newSellOrder(newSellPrices);

            const price = newSellPrices[0].price;
            const value = newSellPrices[0].price;

            // update buy orders price
            sellOrders.forEach(async (item) => {
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
                      prices: newSellPrices,
                    },
                  },
                  quantityRemaining: newSellPrices.length.toString(),
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
          } else {
            await newSellOrder([
              {
                bin: tradeBin.toString(),
                price: tradeBin.toString(),
                lpTokenId,
              },
            ]);
          }
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
