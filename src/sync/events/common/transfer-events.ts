import { db, pgp } from "@/common/db";
import { BaseEventParams } from "@/events-sync/parser";

export type TransferEvent = {
  kind: "erc20" | "erc721" | "erc1155";
  from: Buffer;
  to: Buffer;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

export const addTransferEvents = async (transferEvents: TransferEvent[]) => {
  // Keep track of all unique contracts and tokens
  const uniqueContracts = new Set<string>();
  const uniqueTokens = new Set<string>();

  const transferValues: any[] = [];
  const contractValues: any[] = [];
  const tokenValues: any[] = [];
  for (const event of transferEvents) {
    transferValues.push({
      address: event.baseEventParams.address,
      block: event.baseEventParams.block,
      block_hash: event.baseEventParams.blockHash,
      tx_hash: event.baseEventParams.txHash,
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      from: event.from,
      to: event.to,
      token_id: event.tokenId,
      amount: event.amount,
    });

    if (event.kind !== "erc20") {
      const contractId = event.baseEventParams.address.toString();
      if (!uniqueContracts.has(contractId)) {
        contractValues.push({
          address: event.baseEventParams.address,
          kind: event.kind,
        });
      }

      const tokenId = `${contractId}-${event.tokenId}`;
      if (!uniqueTokens.has(tokenId)) {
        tokenValues.push({
          contract: event.baseEventParams.address,
          token_id: event.tokenId,
        });
      }
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
        "from",
        "to",
        "token_id",
        "amount",
      ],
      { table: "transfer_events" }
    );

    // Atomically insert the transfer events and update balances
    queries.push(`
      WITH "x" AS (
        INSERT INTO "transfer_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
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
      INSERT INTO "balances" (
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
        UPDATE SET "amount" = "balances"."amount" + "excluded"."amount"
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
    const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], {
      table: "tokens",
    });

    queries.push(`
      INSERT INTO "tokens" (
        "contract",
        "token_id"
      ) VALUES ${pgp.helpers.values(tokenValues, columns)}
      ON CONFLICT DO NOTHING
    `);
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeTransferEvents = async (blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await db.any(
    `
      WITH "x" AS (
        DELETE FROM "transfer_events"
        WHERE "block_hash" = $/blockHash/
        RETURNING
          "address",
          "token_id",
          array["from", "to"] as "owners",
          array["amount", -"amount"] as "amount_deltas"
      )
      INSERT INTO "ownerships" (
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
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."token_id", "y"."owner"
      )
        ON CONFLICT ("contract", "token_id", "owner") DO
        UPDATE SET "amount" = "balances"."amount" + "excluded"."amount"
    `,
    { blockHash }
  );
};
