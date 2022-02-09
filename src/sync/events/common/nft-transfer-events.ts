import { db, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import * as nftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";

export type Event = {
  kind: "erc721" | "erc1155";
  from: string;
  to: string;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

export const addEvents = async (events: Event[], backfill: boolean) => {
  // Keep track of all unique contracts and tokens
  const uniqueContracts = new Set<string>();
  const uniqueTokens = new Set<string>();

  const transferValues: any[] = [];
  const contractValues: any[] = [];
  const tokenValues: any[] = [];
  for (const event of events) {
    transferValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      from: toBuffer(event.from),
      to: toBuffer(event.to),
      token_id: event.tokenId,
      amount: event.amount,
    });

    const contractId = event.baseEventParams.address.toString();
    if (!uniqueContracts.has(contractId)) {
      contractValues.push({
        address: toBuffer(event.baseEventParams.address),
        kind: event.kind,
      });
    }

    const tokenId = `${contractId}-${event.tokenId}`;
    if (!uniqueTokens.has(tokenId)) {
      tokenValues.push({
        contract: toBuffer(event.baseEventParams.address),
        token_id: event.tokenId,
      });
    }
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
        "token_id",
        "amount",
      ],
      { table: "nft_transfer_events" }
    );

    // Atomically insert the transfer events and update balances
    queries.push(`
      WITH "x" AS (
        INSERT INTO "nft_transfer_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "from",
          "to",
          "token_id",
          "amount"
        ) VALUES ${pgp.helpers.values(transferValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING
          "address",
          "token_id",
          array["from", "to"] as "owners",
          array[-"amount", "amount"] as "amount_deltas"
      )
      INSERT INTO "nft_balances" (
        "contract",
        "token_id",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."token_id",
          "y"."owner",
          sum("y"."amount_delta")
        FROM (
          SELECT
            "address",
            "token_id",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."token_id", "y"."owner"
      )
      ON CONFLICT ("contract", "token_id", "owner") DO
      UPDATE SET "amount" = "nft_balances"."amount" + "excluded"."amount"
    `);
  }

  if (contractValues.length) {
    const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
      table: "contracts",
    });

    queries.push(`
      INSERT INTO "contracts" (
        "address",
        "kind"
      ) VALUES ${pgp.helpers.values(contractValues, columns)}
      ON CONFLICT DO NOTHING
    `);
  }

  if (tokenValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "contract",
        "token_id",
        { name: "created_at", init: () => "now()", mod: ":raw" },
        { name: "updated_at", init: () => "now()", mod: ":raw" },
      ],
      {
        table: "tokens",
      }
    );

    queries.push(`
      INSERT INTO "tokens" (
        "contract",
        "token_id",
        "created_at",
        "updated_at"
      ) VALUES ${pgp.helpers.values(tokenValues, columns)}
      ON CONFLICT DO NOTHING
    `);
  }

  if (queries.length) {
    await nftTransfersWriteBuffer.addToQueue(pgp.helpers.concat(queries), {
      prioritized: !backfill,
    });
  }
};

export const removeEvents = async (blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await db.any(
    `
      WITH "x" AS (
        DELETE FROM "nft_transfer_events"
        WHERE "block_hash" = $/blockHash/
        RETURNING
          "address",
          "token_id",
          array["from", "to"] as "owners",
          array["amount", -"amount"] as "amount_deltas"
      )
      INSERT INTO "nft_balances" (
        "contract",
        "token_id",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."token_id",
          "y"."owner",
          sum("y"."amount_delta")
        FROM (
          SELECT
            "address",
            "token_id",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."token_id", "y"."owner"
      )
      ON CONFLICT ("contract", "token_id", "owner") DO
      UPDATE SET "amount" = "nft_balances"."amount" + "excluded"."amount"
    `,
    { blockHash: toBuffer(blockHash) }
  );
};
