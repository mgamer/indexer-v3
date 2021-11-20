import { db, pgp } from "../../../../common/db";
import { BaseParams } from "../parser";

type TransferKind = "erc20" | "erc721" | "erc1155";

export type Transfer = {
  tokenId: string;
  amount: string;
  from: string;
  to: string;
  baseParams: BaseParams;
};

export const addTransfers = async (
  transfers: Transfer[],
  kind: TransferKind
) => {
  // Keep track of all involved tokens
  const contractToTokens = new Map<string, Set<string>>();
  const addToken = (contract: string, tokenId: string) => {
    if (!contractToTokens.get(contract)) {
      contractToTokens.set(contract, new Set<string>());
    }
    // "-1" represents missing token id (eg. for erc20)
    if (tokenId !== "-1") {
      contractToTokens.get(contract)?.add(tokenId);
    }
  };

  const inserts: any[] = [];
  for (const transfer of transfers) {
    addToken(transfer.baseParams.address, transfer.tokenId);

    // Atomically insert the transfer event and update ownerships
    inserts.push({
      query: `
        with "x" as (
          insert into "transfer_events"(
            "token_id",
            "amount",
            "from",
            "to",
            "address",
            "block",
            "block_hash",
            "tx_hash",
            "tx_index",
            "log_index"
          ) values (
            $/tokenId/::numeric(78, 0),
            $/amount/::numeric(78, 0),
            $/from/,
            $/to/,
            $/address/,
            $/block/,
            $/blockHash/,
            $/txHash/,
            $/txIndex/,
            $/logIndex/
          ) on conflict do nothing
          returning
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
            $/address/,
            $/tokenId/::numeric(78, 0),
            "y"."owner",
            sum("y"."amount_delta")
          from (
            select
              unnest("owners") as "owner",
              unnest("amount_deltas") as "amount_delta"
            from "x"
          ) "y"
          group by "y"."owner"
        ) on conflict ("contract", "token_id", "owner") do
        update set "amount" = "ownerships"."amount" + "excluded"."amount"
      `,
      values: {
        ...transfer,
        ...transfer.baseParams,
      },
    });
  }

  // Make sure referenced contracts exist
  const contractInserts: any[] = [];
  for (const contract of contractToTokens.keys()) {
    contractInserts.push({
      query: `
        insert into "contracts" (
          "address",
          "kind"
        ) values (
          $/contract/,
          $/kind/
        ) on conflict do nothing`,
      values: {
        contract,
        kind,
      },
    });
  }

  // Make sure referenced tokens exist
  const tokenInserts: any[] = [];
  for (const [contract, tokenIds] of contractToTokens.entries()) {
    for (const tokenId of tokenIds) {
      tokenInserts.push({
        query: `
          insert into "tokens" (
            "contract",
            "token_id"
          )
          values (
            $/contract/,
            $/tokenId/::numeric(78, 0)
          ) on conflict do nothing`,
        values: {
          contract,
          tokenId,
        },
      });
    }
  }

  const queries = [...contractInserts, ...tokenInserts, ...inserts];
  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeTransfers = async (blockHash: string) => {
  // Atomically delete the transfer events and update ownerships
  await db.none(
    `
      with "x" as (
        delete from "transfer_events" where "block_hash" = $/blockHash/
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
          $/address/,
          $/tokenId/::numeric(78, 0),
          "y"."owner",
          sum("y"."amount_delta")
        from (
          select
            unnest("owners") as "owner",
            unnest("amount_deltas") as "amount_delta"
          from "x"
        ) "y"
        group by "y"."owner"
      ) on conflict ("contract", "token_id", "owner") do
      update set "amount" = "ownerships"."amount" + "excluded"."amount"
    `,
    { blockHash }
  );
};
