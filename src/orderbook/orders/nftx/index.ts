import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import * as nftx from "@/utils/nftx";
import { parseEther } from "ethers/lib/utils";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export type OrderInfo = {
  orderParams: {
    pool: string;
    txTimestamp: number;
    txHash: string;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

export const getOrderId = (pool: string, side: "sell" | "buy", tokenId?: string) =>
  side === "buy"
    ? // Buy orders have a single order id per pool
      keccak256(["string", "address", "string"], ["nftx", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["nftx", pool, side, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await nftx.getNftPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      const amount = 10;
      const poolPrice = await nftx.getPoolPrice(orderParams.pool, amount);

      // Handle: fees
      const feeBps = 0;
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [];

      // Handle buy orders
      try {
        const { buy, currency } = poolPrice;
        const id = getOrderId(orderParams.pool, "buy");

        if (buy) {
          // Handle: prices
          const price = parseEther(buy).toString();
          const value = parseEther(buy).toString();

          // Handle: royalties on top
          const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
            `contract:${pool.nft}`,
            "default"
          );

          const totalBuiltInBps = 0;
          const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

          const missingRoyalties = [];
          let missingRoyaltyAmount = bn(0);
          if (totalBuiltInBps < totalDefaultBps) {
            const validRecipients = defaultRoyalties.filter(
              ({ bps, recipient }) => bps && recipient !== AddressZero
            );
            if (validRecipients.length) {
              const bpsDiff = totalDefaultBps - totalBuiltInBps;
              const amount = bn(price).mul(bpsDiff).div(10000).toString();
              missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

              missingRoyalties.push({
                bps: bpsDiff,
                amount,
                // TODO: We should probably split pro-rata across all royalty recipients
                recipient: validRecipients[0].recipient,
              });
            }
          }

          const normalizedValue = bn(value).sub(missingRoyaltyAmount);

          // Handle: core sdk order
          const sdkParams = {
            pair: orderParams.pool,
            extra: {
              price: price.toString(),
            },
          };

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
            const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
              {
                id: `contract:${pool.nft}`,
                schemaHash,
                contract: pool.nft,
              },
            ]);

            if (!tokenSetId) {
              throw new Error("No token set available");
            }

            // Handle: source
            const sources = await Sources.getInstance();
            const source = await sources.getOrInsert("nftx.io");

            const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
            const validTo = `'Infinity'`;

            orderValues.push({
              id,
              kind: "nftx",
              side: "buy",
              fillability_status: "fillable",
              approval_status: "approved",
              token_set_id: tokenSetId,
              token_set_schema_hash: toBuffer(schemaHash),
              maker: toBuffer(pool.address),
              taker: toBuffer(AddressZero),
              price,
              value,
              currency: toBuffer(currency),
              currency_price: price,
              currency_value: value,
              needs_conversion: null,
              quantity_remaining: amount.toString(),
              valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
              nonce: null,
              source_id_int: source?.id,
              is_reservoir: null,
              contract: toBuffer(pool.nft),
              conduit: null,
              fee_bps: feeBps,
              fee_breakdown: feeBreakdown,
              dynamic: null,
              raw_data: sdkParams,
              expiration: validTo,
              missing_royalties: missingRoyalties,
              normalized_value: normalizedValue.toString(),
              currency_normalized_value: normalizedValue.toString(),
            });

            results.push({
              id,
              txHash: orderParams.txHash,
              status: "success",
              triggerKind: "new-order",
            });
          } else {
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'fillable',
                  price = $/price/,
                  currency_price = $/price/,
                  value = $/value/,
                  currency_value = $/value/,
                  quantity_remaining = $/quantityRemaining/,
                  valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                  expiration = 'Infinity',
                  updated_at = now(),
                  raw_data = $/rawData:json/,
                  missing_royalties = $/missingRoyalties:json/,
                  normalized_value = $/normalizedValue/,
                  currency_normalized_value = $/currencyNormalizedValue/,
                  fee_bps = $/feeBps/,
                  fee_breakdown = $/feeBreakdown:json/
                WHERE orders.id = $/id/
              `,
              {
                id,
                price,
                value,
                rawData: sdkParams,
                quantityRemaining: amount.toString(),
                missingRoyalties: missingRoyalties,
                normalizedValue: normalizedValue.toString(),
                currencyNormalizedValue: normalizedValue.toString(),
                feeBps,
                feeBreakdown,
              }
            );
            results.push({
              id,
              txHash: orderParams.txHash,
              status: "success",
              triggerKind: "reprice",
            });
          }
        } else {
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'no-balance',
                expiration = to_timestamp(${orderParams.txTimestamp}),
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            { id }
          );
          results.push({
            id,
            txHash: orderParams.txHash,
            status: "success",
            triggerKind: "reprice",
          });
        }
      } catch (error) {
        logger.error(
          "orders-nftx-save",
          `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }

      // Handle sell orders
      try {
        const { sell, currency } = poolPrice;

        if (sell) {
          // Handle: prices
          const price = parseEther(sell).toString();
          const value = parseEther(sell).toString();
          // Handle: royalties on top
          const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
            `contract:${pool.nft}`,
            "default"
          );
          const totalBuiltInBps = 0;
          const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);
          const missingRoyalties = [];
          let missingRoyaltyAmount = bn(0);
          if (totalBuiltInBps < totalDefaultBps) {
            const validRecipients = defaultRoyalties.filter(
              ({ bps, recipient }) => bps && recipient !== AddressZero
            );
            if (validRecipients.length) {
              const bpsDiff = totalDefaultBps - totalBuiltInBps;
              const amount = bn(price).mul(bpsDiff).div(10000).toString();
              missingRoyaltyAmount = missingRoyaltyAmount.add(amount);
              missingRoyalties.push({
                bps: bpsDiff,
                amount,
                // TODO: We should probably split pro-rata across all royalty recipients
                recipient: validRecipients[0].recipient,
              });
            }
          }
          const normalizedValue = bn(value).add(missingRoyaltyAmount);
          // Fetch all token ids owned by the pool
          const poolOwnedTokenIdsInDB = await commonHelpers.getNfts(pool.nft, pool.address);
          const poolOwnedTokenIdsOnChain = await nftx.getPoolNFTs(pool.address);
          const poolOwnedTokenIds = poolOwnedTokenIdsOnChain.length ? poolOwnedTokenIdsOnChain : poolOwnedTokenIdsInDB;

          for (const tokenId of poolOwnedTokenIds) {
            try {
              const id = getOrderId(orderParams.pool, "sell", tokenId);
              // Handle: core sdk order
              const sdkParams = {
                pair: orderParams.pool,
                tokenId,
                extra: {
                  price: price.toString(),
                },
              };

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
                    id: `token:${pool.nft}:${tokenId}`,
                    schemaHash,
                    contract: pool.nft,
                    tokenId,
                  },
                ]);
                if (!tokenSetId) {
                  throw new Error("No token set available");
                }
                // Handle: source
                const sources = await Sources.getInstance();
                const source = await sources.getOrInsert("nftx.io");
                const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
                const validTo = `'Infinity'`;
                orderValues.push({
                  id,
                  kind: "nftx",
                  side: "sell",
                  fillability_status: "fillable",
                  approval_status: "approved",
                  token_set_id: tokenSetId,
                  token_set_schema_hash: toBuffer(schemaHash),
                  maker: toBuffer(pool.address),
                  taker: toBuffer(AddressZero),
                  price,
                  value,
                  currency: toBuffer(currency),
                  currency_price: price,
                  currency_value: value,
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
                  raw_data: sdkParams,
                  expiration: validTo,
                  missing_royalties: missingRoyalties,
                  normalized_value: normalizedValue.toString(),
                  currency_normalized_value: normalizedValue.toString(),
                });

                results.push({
                  id,
                  txHash: orderParams.txHash,
                  status: "success",
                  triggerKind: "new-order",
                });
              } else {
                await idb.none(
                  `
                    UPDATE orders SET
                      fillability_status = 'fillable',
                      price = $/price/,
                      currency_price = $/price/,
                      value = $/value/,
                      currency_value = $/value/,
                      quantity_remaining = 1,
                      valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                      expiration = 'Infinity',
                      updated_at = now(),
                      raw_data = $/rawData:json/,
                      missing_royalties = $/missingRoyalties:json/,
                      normalized_value = $/normalizedValue/,
                      currency_normalized_value = $/currencyNormalizedValue/,
                      fee_bps = $/feeBps/,
                      fee_breakdown = $/feeBreakdown:json/
                    WHERE orders.id = $/id/
                  `,
                  {
                    id,
                    price,
                    value,
                    rawData: sdkParams,
                    missingRoyalties: missingRoyalties,
                    normalizedValue: normalizedValue.toString(),
                    currencyNormalizedValue: normalizedValue.toString(),
                    feeBps,
                    feeBreakdown,
                  }
                );

                results.push({
                  id,
                  txHash: orderParams.txHash,
                  status: "success",
                  triggerKind: "reprice",
                });
              }
            } catch {
              // Ignore any errors
            }
          }
        }
      } catch (error) {
        logger.error(
          "orders-nftx-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }
    } catch (error) {
      logger.error(
        "orders-nftx-save",
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
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
  }

  await ordersUpdateById.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
            },
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
