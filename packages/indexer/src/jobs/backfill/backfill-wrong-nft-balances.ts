/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber } from "@ethersproject/bignumber";
// import { AddressZero } from "@ethersproject/constants";
import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-wrong-nft-balances";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

const RUN_NUMBER = 3;

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { fromBlock, toBlock } = job.data;

      try {
        const results = await idb.manyOrNone(
          `
            SELECT
              nft_transfer_events.address,
              nft_transfer_events.token_id
            FROM nft_transfer_events
            WHERE nft_transfer_events.block = $/block/
            ORDER BY
              nft_transfer_events.log_index,
              nft_transfer_events.batch_index
          `,
          {
            block: toBlock,
          }
        );

        if (results.length) {
          // const values: any[] = [];
          await Promise.all(
            results.map(async (r) => {
              const contract = fromBuffer(r.address);
              const tokenId = r.token_id;

              const lockKey = `${contract}-${tokenId}-${RUN_NUMBER}`;
              const lock = await redis.get(lockKey);
              if (!lock) {
                await redis.set(lockKey, "locked", "EX", 3600);

                const transfers = await idb.manyOrNone(
                  `
                    SELECT
                      nft_transfer_events.amount,
                      nft_transfer_events.from,
                      nft_transfer_events.to
                    FROM nft_transfer_events
                    WHERE nft_transfer_events.address = $/contract/
                      AND nft_transfer_events.token_id = $/tokenId/
                  `,
                  {
                    contract: toBuffer(contract),
                    tokenId,
                  }
                );

                const balances: { [address: string]: BigNumber } = {};
                for (const t of transfers) {
                  const from = fromBuffer(t.from);
                  const to = fromBuffer(t.to);
                  const amount = BigNumber.from(t.amount);

                  if (!balances[from]) {
                    balances[from] = BigNumber.from(0);
                  }
                  balances[from] = balances[from].sub(amount);

                  if (!balances[to]) {
                    balances[to] = BigNumber.from(0);
                  }
                  balances[to] = balances[to].add(amount);
                }

                const currentBalances = await idb.manyOrNone(
                  `
                    SELECT
                      nft_balances.owner,
                      nft_balances.amount
                    FROM nft_balances
                    WHERE nft_balances.contract = $/contract/
                      AND nft_balances.token_id = $/tokenId/
                  `,
                  {
                    contract: toBuffer(contract),
                    tokenId,
                  }
                );
                for (const c of currentBalances) {
                  const owner = fromBuffer(c.owner);
                  const amount = c.amount;

                  if (!balances[owner]) {
                    balances[owner] = BigNumber.from(0);
                  }

                  if (balances[owner].toString() !== amount) {
                    logger.warn(
                      QUEUE_NAME,
                      `Different balance: ${contract}:${tokenId} (owner = ${owner}) (current = ${amount}) (computed = ${balances[
                        owner
                      ].toString()})`
                    );
                  }
                }

                // for (const [address, balance] of Object.entries(balances)) {
                //   if (address !== AddressZero) {
                //     values.push({
                //       contract: toBuffer(contract),
                //       tokenId,
                //       owner: toBuffer(address),
                //       amount: balance.toString(),
                //     });
                //   }
                // }
              }
            })
          );

          //   const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "owner", "amount"], {
          //     table: "nft_balances",
          //   });
          //   if (values.length) {
          //     await idb.none(
          //       `
          //         UPDATE nft_balances SET
          //           amount = x.amount::NUMERIC(78, 0)
          //         FROM (
          //           VALUES ${pgp.helpers.values(values, columns)}
          //         ) AS x(contract, token_id, owner, amount)
          //         WHERE nft_balances.contract = x.contract::BYTEA
          //           AND nft_balances.token_id = x.token_id::NUMERIC(78, 0)
          //           AND nft_balances.owner = x.owner::BYTEA
          //       `
          //     );
          //   }
        }

        if (toBlock > fromBlock) {
          await addToQueue(fromBlock, toBlock - 1);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId !== 56) {
    redlock
      .acquire([`${QUEUE_NAME}-lock-${RUN_NUMBER}`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => {
        const getClosestBlock = async (timestamp: number) =>
          idb
            .oneOrNone(
              `
                SELECT
                  nft_transfer_events.block
                FROM nft_transfer_events
                WHERE nft_transfer_events.timestamp <= $/timestamp/
                ORDER BY nft_transfer_events.timestamp DESC
                LIMIT 1
              `,
              { timestamp }
            )
            .then((r) => r.block);

        const fromTimestamp = 1683561600;
        const toTimestamp = 1683611652;
        await addToQueue(await getClosestBlock(fromTimestamp), await getClosestBlock(toTimestamp));
      })
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (fromBlock: number, toBlock: number) => {
  const id = `${fromBlock}-${toBlock}-${RUN_NUMBER}`;
  await queue.add(id, { fromBlock, toBlock }, { jobId: id, delay: 1000 });
};
