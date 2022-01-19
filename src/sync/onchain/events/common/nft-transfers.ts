import { db, pgp } from "@/common/db";
import { BaseParams } from "@/events/parser";

export type NftTransferEvent = {
  tokenId: string;
  from: string;
  to: string;
  amount: string;
  baseParams: BaseParams;
};

export const addNftTransferEvents = async (
  transferEvents: NftTransferEvent[]
) => {
  // Keep track of all involved tokens so that we can save
  // them in the `contracts` and `tokens` tables
  const contractTokens = new Map<string, Set<string>>();
  const addToken = (contract: string, tokenId: string) => {
    if (!contractTokens.get(contract)) {
      contractTokens.set(contract, new Set<string>());
    }
    contractTokens.get(contract)!.add(tokenId);
  };

  const transferValues: any[] = [];
  for (const te of transferEvents) {
    addToken(te.baseParams.address, te.tokenId);
    transferValues.push({
      token_id: te.tokenId,
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
        "token_id",
        "amount",
        "from",
        "to",
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "log_index",
      ],
      { table: "nft_transfer_events" }
    );
    const values = pgp.helpers.values(transferValues, columns);

    if (values.length) {
      // Atomically insert the transfer events and update ownership
      transferInsertsQuery = `
        with "x" as (
          insert into "nft_transfer_events" (
            "token_id",
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
            "token_id",
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
            "y"."token_id",
            "y"."owner",
            sum("y"."amount_delta")
          from (
            select
              "address",
              "token_id",
              unnest("owners") as "owner",
              unnest("amount_deltas") as "amount_delta"
            from "x"
          ) "y"
          group by "y"."address", "y"."token_id", "y"."owner"
        ) on conflict ("contract", "token_id", "owner") do
        update set "amount" = "ownerships"."amount" + "excluded"."amount"
      `;
    }
  }

  const tokenValues: any[] = [];
  for (const [contract, tokenIds] of contractTokens.entries()) {
    for (const tokenId of tokenIds) {
      tokenValues.push({
        contract,
        token_id: tokenId,
      });
    }
  }

  let tokenInsertsQuery: string | undefined;
  if (tokenValues.length) {
    const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], {
      table: "tokens",
    });
    const values = pgp.helpers.values(tokenValues, columns);

    // TODO: For newly minted tokens we should also populate
    // various cached information (eg. floor sell, top buy),
    // otherwise the tokens might be missing from the results
    // of various APIs which depend on these cached values.
    // Detecting newly minted tokens can easily be done by
    // matching the `from` field to address 0.
    tokenInsertsQuery = `
      insert into "tokens" ("contract", "token_id")
      values ${values}
      on conflict do nothing
    `;
  }

  const queries: any[] = [];
  if (tokenInsertsQuery) {
    queries.push(tokenInsertsQuery);
  }
  if (transferInsertsQuery) {
    queries.push(transferInsertsQuery);
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeNftTransferEvents = async (blockHash: string) => {
  // Atomically delete the transfer events and revert ownership updates
  await db.any(
    `
      with "x" as (
        delete from "nft_transfer_events" where "block_hash" = $/blockHash/
        returning
          "address",
          "token_id",
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
          "y"."token_id",
          "y"."owner",
          sum("y"."amount_delta")
        from (
          select
            "address",
            "token_id",
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          from "x"
        ) "y"
        group by "y"."address", "y"."token_id", "y"."owner"
      ) on conflict ("contract", "token_id", "owner") do
      update set "amount" = "ownerships"."amount" + "excluded"."amount"
    `,
    { blockHash }
  );
};
