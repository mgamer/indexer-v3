import { db, pgp } from "@/common/db";
import { BaseEventParams } from "@/events-sync/parser";
import * as eventsSyncWrite from "@/jobs/events-sync/write-queue";

export type Event = {
  from: Buffer;
  to: Buffer;
  amount: string;
  baseEventParams: BaseEventParams;
};

export const addEvents = async (events: Event[], backfill: boolean) => {
  const transferValues: any[] = [];
  for (const event of events) {
    transferValues.push({
      address: event.baseEventParams.address,
      block: event.baseEventParams.block,
      block_hash: event.baseEventParams.blockHash,
      tx_hash: event.baseEventParams.txHash,
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      from: event.from,
      to: event.to,
      amount: event.amount,
    });
  }

  const queries: string[] = [];

  if (transferValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "from",
        "to",
        "amount",
      ],
      { table: "ft_transfer_events" }
    );

    // Atomically insert the transfer events and update balances
    queries.push(`
      WITH "x" AS (
        INSERT INTO "ft_transfer_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "from",
          "to",
          "amount"
        ) VALUES ${pgp.helpers.values(transferValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING
          "address",
          array["from", "to"] as "owners",
          array[-"amount", "amount"] as "amount_deltas"
      )
      INSERT INTO "ft_balances" (
        "contract",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."owner",
          sum("y"."amount_delta")
        FROM (
          SELECT
            "address",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."owner"
      )
      ON CONFLICT ("contract", "owner") DO
      UPDATE SET "amount" = "ft_balances"."amount" + "excluded"."amount"
    `);
  }

  if (queries.length) {
    await eventsSyncWrite.addToQueue(pgp.helpers.concat(queries), {
      prioritized: !backfill,
    });
  }
};

export const removeEvents = async (blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await db.any(
    `
      WITH "x" AS (
        DELETE FROM "ft_transfer_events"
        WHERE "block_hash" = $/blockHash/
        RETURNING
          "address",
          array["from", "to"] as "owners",
          array["amount", -"amount"] as "amount_deltas"
      )
      INSERT INTO "ft_balances" (
        "contract",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."owner",
          sum("y"."amount_delta")
        FROM (
          SELECT
            "address",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."owner"
      )
      ON CONFLICT ("contract", "owner") DO
      UPDATE SET "amount" = "ft_balances"."amount" + "excluded"."amount"
    `,
    { blockHash }
  );
};
