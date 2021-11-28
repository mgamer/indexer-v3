import { db, pgp } from "@/common/db";
import { BaseParams } from "@/events/parser";

export type FtTransferEvent = {
  from: string;
  to: string;
  amount: string;
  baseParams: BaseParams;
};

export const addFtTransferEvents = async (
  transferEvents: FtTransferEvent[]
) => {
  const transferValues: any[] = [];
  for (const te of transferEvents) {
    transferValues.push({
      amount: te.amount,
      from: te.from,
      to: te.to,
      address: te.baseParams.address,
      block: te.baseParams.block,
      block_hash: te.baseParams.blockHash,
      tx_hash: te.baseParams.txHash,
      log_index: te.baseParams.logIndex,
    });
  }

  let transferInsertsQuery: string | undefined;
  if (transferValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "amount",
        "from",
        "to",
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "log_index",
      ],
      { table: "ft_transfer_events" }
    );
    const values = pgp.helpers.values(transferValues, columns);

    if (values.length) {
      // Atomically insert the transfer events and update ownership
      transferInsertsQuery = `
        with "x" as (
          insert into "ft_transfer_events" (
            "amount",
            "from",
            "to",
            "address",
            "block",
            "block_hash",
            "tx_hash",
            "log_index"
          ) values ${values}
          on conflict do nothing
          returning
            "address",
            array["from", "to"] as "owners",
            array[-"amount", "amount"] as "amount_deltas"
        )
        insert into "ownerships" (
          "contract",
          "token_id",
          "owner",
          "amount"
        ) (
          select
            "y"."address",
            -1::numeric(78, 0),
            "y"."owner",
            sum("y"."amount_delta")
          from (
            select
              "address",
              unnest("owners") as "owner",
              unnest("amount_deltas") as "amount_delta"
            from "x"
          ) "y"
          group by "y"."address", "y"."owner"
        ) on conflict ("contract", "token_id", "owner") do
        update set "amount" = "ownerships"."amount" + "excluded"."amount"
      `;
    }
  }

  const queries: any[] = [];
  if (transferInsertsQuery) {
    queries.push(transferInsertsQuery);
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeFtTransferEvents = async (blockHash: string) => {
  // Atomically delete the transfer events and revert ownership updates
  await db.any(
    `
      with "x" as (
        delete from "ft_transfer_events" where "block_hash" = $/blockHash/
        returning
          "address",
          array["from", "to"] as "owners",
          array["amount", -"amount"] as "amount_deltas"
      )
      insert into "ownerships" (
        "contract",
        "token_id",
        "owner",
        "amount"
      ) (
        select
          "y"."address",
          -1::numeric(78, 0),
          "y"."owner",
          sum("y"."amount_delta")
        from (
          select
            "address",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          from "x"
        ) "y"
        group by "y"."address", "y"."owner"
      ) on conflict ("contract", "token_id", "owner") do
      update set "amount" = "ownerships"."amount" + "excluded"."amount"
    `,
    { blockHash }
  );
};
