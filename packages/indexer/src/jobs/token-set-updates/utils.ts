/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb, ridb } from "@/common/db";
import _, { now } from "lodash";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";
import { logger } from "@/common/logger";
import {
  topBidCollectionJob,
  TopBidCollectionJobPayload,
} from "@/jobs/collection-updates/top-bid-collection-job";
import { getNetworkSettings } from "@/config/network";
import { Collections } from "@/models/collections";
import { redis } from "@/common/redis";

export type topBidPayload = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export async function processTopBid(payload: topBidPayload, queueName: string) {
  try {
    let tokenSetTopBid = await idb.manyOrNone(
      `
                WITH x AS (
                  SELECT
                    token_sets.id AS token_set_id,
                    y.*
                  FROM token_sets
                  LEFT JOIN LATERAL (
                    SELECT
                      orders.id AS order_id,
                      orders.value,
                      orders.maker
                    FROM orders
                    WHERE orders.token_set_id = token_sets.id
                      AND orders.side = 'buy'
                      AND orders.fillability_status = 'fillable'
                      AND orders.approval_status = 'approved'
                      AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                    ORDER BY orders.value DESC
                    LIMIT 1
                  ) y ON TRUE
                  WHERE token_sets.id = $/tokenSetId/
                )
                UPDATE token_sets SET
                  top_buy_id = x.order_id,
                  top_buy_value = x.value,
                  top_buy_maker = x.maker,
                  attribute_id = token_sets.attribute_id,
                  collection_id = token_sets.collection_id
                FROM x
                WHERE token_sets.id = x.token_set_id
                  AND (
                    token_sets.top_buy_id IS DISTINCT FROM x.order_id
                    OR token_sets.top_buy_value IS DISTINCT FROM x.value
                  )
                RETURNING
                  collection_id AS "collectionId",
                  attribute_id AS "attributeId",
                  top_buy_value AS "topBuyValue",
                  top_buy_id AS "topBuyId"
              `,
      { tokenSetId: payload.tokenSetId }
    );

    if (!tokenSetTopBid.length && payload.kind === "revalidation") {
      // When revalidating, force revalidation of the attribute / collection
      const tokenSetsResult = await ridb.manyOrNone(
        `
                  SELECT
                    token_sets.collection_id,
                    token_sets.attribute_id
                  FROM token_sets
                  WHERE token_sets.id = $/tokenSetId/
                `,
        {
          tokenSetId: payload.tokenSetId,
        }
      );

      if (tokenSetsResult.length) {
        tokenSetTopBid = tokenSetsResult.map(
          (result: { collection_id: any; attribute_id: any }) => ({
            kind: payload.kind,
            collectionId: result.collection_id,
            attributeId: result.attribute_id,
            txHash: payload.txHash || null,
            txTimestamp: payload.txTimestamp || null,
          })
        );
      }
    }

    if (tokenSetTopBid.length) {
      if (
        payload.kind === "new-order" &&
        tokenSetTopBid[0].topBuyId &&
        _.isNull(tokenSetTopBid[0].collectionId)
      ) {
        const collectionTopBidValue = await getTopBidValue(payload.tokenSetId);

        // if its a single token top bid, check if its lower than the top bid on the collection and skip if it is
        if (
          collectionTopBidValue &&
          Number(collectionTopBidValue) > Number(tokenSetTopBid[0].topBuyValue)
        ) {
          logger.info(
            queueName,
            `Top bid on collection is higher than current bid, no event trigger. data=${JSON.stringify(
              {
                orderId: tokenSetTopBid[0].topBuyId,
              }
            )}`
          );

          return;
        } else {
          logger.info(
            queueName,
            `Top bid on collection is lower than current bid, trigger event. data=${JSON.stringify({
              orderId: tokenSetTopBid[0].topBuyId,
            })}, topBidOnCollection=${collectionTopBidValue}`
          );
        }

        //  Only trigger websocket event for non collection offers.
        await WebsocketEventRouter({
          eventKind: WebsocketEventKind.NewTopBid,
          eventInfo: {
            orderId: tokenSetTopBid[0].topBuyId,
          },
        });
      }

      for (const result of tokenSetTopBid) {
        if (!_.isNull(result.attributeId)) {
          await handleNewBuyOrderJob.addToQueue(result);
        }

        if (!_.isNull(result.collectionId)) {
          await topBidCollectionJob.addToQueue([
            {
              collectionId: result.collectionId,
              kind: payload.kind,
              txHash: payload.txHash || null,
              txTimestamp: payload.txTimestamp || null,
            } as TopBidCollectionJobPayload,
          ]);
        }
      }
    }
  } catch (error) {
    logger.error(
      queueName,
      `Failed to process token set top-bid info ${JSON.stringify(payload)}: ${error}`
    );
    throw error;
  }
}

const getTopBidValue = async (tokenSetId: string): Promise<number | null> => {
  const [, contract, tokenId] = tokenSetId.split(":");
  if (!contract || !tokenId) {
    return null;
  }

  let collection = null;
  let collectionTopBidValue = null;

  if (getNetworkSettings().multiCollectionContracts.includes(contract)) {
    collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));
  } else {
    collection = contract;
  }

  collectionTopBidValue = await redis.get(`collection-top-bid:${collection}`);
  if (collectionTopBidValue) {
    return Number(collectionTopBidValue);
  }

  // if not found in cache, get from db and set cache
  const collectionTopBid = await ridb.oneOrNone(
    `
            SELECT
              top_buy_value,
              y.valid_until
            FROM collections
            LEFT JOIN LATERAL (
              SELECT
              coalesce(
                nullif(date_part('epoch', upper(order_valid_between)), 'Infinity'),
                0
              ) AS valid_until
              FROM orders
              WHERE orders.id = collections.top_buy_id
            ) y ON TRUE
            WHERE id = $/collection/
          `,
    {
      collection,
    }
  );

  if (collectionTopBid) {
    collectionTopBidValue = collectionTopBid?.top_buy_value;
    const expiry = collectionTopBid?.valid_until - now();
    await redis.set(
      `collection-top-bid:${collection}`,
      Number(collectionTopBidValue.toString()),
      "EX",
      expiry
    );
  }

  return collectionTopBidValue;
};
