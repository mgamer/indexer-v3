import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/bignumber";
import { db, pgp } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  TokenSetInfo,
  generateSingleTokenSetInfo,
  generateTokenRangeSetInfo,
} from "@/orders/utils";
import { addToOrdersUpdateByHashQueue } from "@/jobs/orders-update";

export const filterOrders = async (
  orders: Sdk.WyvernV2.Order[]
): Promise<Sdk.WyvernV2.Order[]> => {
  if (!orders.length) {
    return [];
  }

  // Get the kinds of all contracts targeted by the orders
  const contracts: { address: string; kind: string }[] = await db.manyOrNone(
    `select distinct "address", "kind" from "contracts" where "address" in ($1:csv)`,
    [orders.map((order) => order.params.target)]
  );

  const contractKinds = new Map<string, string>();
  for (const { address, kind } of contracts) {
    contractKinds.set(address, kind);
  }

  // Get all orders we're already storing
  const hashes: { hash: string }[] = await db.manyOrNone(
    `select "hash" from "orders" where "hash" in ($1:csv)`,
    [orders.map((order) => order.prefixHash())]
  );

  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  const validOrders: Sdk.WyvernV2.Order[] = [];
  for (const order of orders) {
    const hash = order.prefixHash();

    // Check: order doesn't already exist
    if (existingHashes.has(hash)) {
      console.log("order already exists", hash);
      continue;
    }

    // Check: order is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = order.params.expirationTime;
    if (expirationTime !== 0 && currentTime >= expirationTime) {
      console.log("order expired");
      continue;
    }

    // Check: buy order has Weth as payment token
    if (
      order.params.side === 0 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
    ) {
      console.log("order wrong payment token");
      continue;
    }

    // Check: sell order has Eth as payment token
    if (
      order.params.side === 1 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
    ) {
      console.log("order wrong payment token");
      continue;
    }

    // Check: order is not private
    if (order.params.taker !== AddressZero) {
      console.log("order is private");
      continue;
    }

    // Check: order has a valid kind
    if (!order.hasValidKind()) {
      console.log("order wrong kind");
      continue;
    }

    // Check: order has a valid target
    if (
      !order.params.kind?.startsWith(contractKinds.get(order.params.target)!)
    ) {
      console.log("order wrong target");
      continue;
    }

    // Check: order has a valid signature
    if (!(await order.hasValidSignature())) {
      console.log("order wrong signature");
      continue;
    }

    // Check: order is fillable
    if (!(await order.isFillable(baseProvider))) {
      console.log("order not fillable");
      continue;
    }

    validOrders.push(order);
  }

  return validOrders;
};

export const saveOrders = async (orders: Sdk.WyvernV2.Order[]) => {
  if (!orders.length) {
    return;
  }

  const queries: any[] = [];
  for (const order of orders) {
    // Extract target token(s) information from the order
    let tokenId: string | undefined;
    let tokenIdRange: [string, string] | undefined;
    switch (order.params.kind) {
      case "erc721-single-token": {
        const builder = new Sdk.WyvernV2.Builders.Erc721.SingleToken(
          config.chainId
        );
        tokenId = builder.getTokenId(order);

        break;
      }

      case "erc1155-single-token": {
        const builder = new Sdk.WyvernV2.Builders.Erc1155.SingleToken(
          config.chainId
        );
        tokenId = builder.getTokenId(order);

        break;
      }

      case "erc721-token-range": {
        const builder = new Sdk.WyvernV2.Builders.Erc721.TokenRange(
          config.chainId
        );
        tokenIdRange = builder.getTokenIdRange(order);

        break;
      }
    }

    let tokenSetInfo: TokenSetInfo | undefined;
    if (tokenId) {
      // The order is a single token order
      tokenSetInfo = generateSingleTokenSetInfo(order.params.target, tokenId);

      // For increased performance, only trigger the creation of
      // the token set if it doesn't already exist in the database
      const tokenSetExists = await db.oneOrNone(
        `select 1 from "token_sets" where "id" = $/tokenSetId/`,
        { tokenSetId: tokenSetInfo.id }
      );
      if (!tokenSetExists) {
        // Create the token set
        queries.push({
          query: `
            insert into "token_sets" (
              "id",
              "contract",
              "token_id",
              "label",
              "label_hash"
            ) values (
              $/tokenSetId/,
              $/contract/,
              $/tokenId/,
              $/tokenSetLabel/,
              $/tokenSetLabelHash/
            ) on conflict do nothing
          `,
          values: {
            tokenSetId: tokenSetInfo.id,
            contract: order.params.target,
            tokenId,
            tokenSetLabel: tokenSetInfo.label,
            tokenSetLabelHash: tokenSetInfo.labelHash,
          },
        });
        // Insert matching tokens in the token set
        queries.push({
          query: `
            insert into "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            ) values (
              $/tokenSetId/,
              $/contract/,
              $/tokenId/
            ) on conflict do nothing
          `,
          values: {
            tokenSetId: tokenSetInfo.id,
            contract: order.params.target,
            tokenId,
          },
        });
      }
    } else if (tokenIdRange) {
      // The order is a token range order

      // Fetch the collection the range order is on (the token range
      // must exactly match the collection's token range definition,
      // otherwise it won't be detected)
      const collection: { id: string } | null = await db.oneOrNone(
        `
          select "id"
          from "collections"
          where "contract" = $/contract/
            and "token_id_range" = numrange($/startTokenId/, $/endTokenId/, '[]')
        `,
        {
          contract: order.params.target,
          startTokenId: tokenIdRange[0],
          endTokenId: tokenIdRange[1],
        }
      );
      if (collection?.id) {
        tokenSetInfo = generateTokenRangeSetInfo(
          collection.id,
          order.params.target,
          tokenIdRange[0],
          tokenIdRange[1]
        );

        // For increased performance, only trigger the creation of
        // the token set if it doesn't already exist in the database
        const tokenSetExists = await db.oneOrNone(
          `select 1 from "token_sets" where "id" = $/tokenSetId/`,
          { tokenSetId: tokenSetInfo.id }
        );
        if (!tokenSetExists) {
          // Create the token set
          queries.push({
            query: `
              insert into "token_sets" (
                "id",
                "collection_id",
                "label",
                "label_hash"
              ) values (
                $/tokenSetId/,
                $/collectionId/,
                $/tokenSetLabel/,
                $/tokenSetLabelHash/
              ) on conflict do nothing
            `,
            values: {
              tokenSetId: tokenSetInfo.id,
              collectionId: collection.id,
              tokenSetLabel: tokenSetInfo.label,
              tokenSetLabelHash: tokenSetInfo.labelHash,
            },
          });
          // Insert matching tokens in the token set
          queries.push({
            query: `
              insert into "token_sets_tokens" (
                "token_set_id",
                "contract",
                "token_id"
              )
              (
                select $/tokenSetId/, "contract", "token_id"
                from "tokens"
                where "collection_id" = $/collectionId/
              ) on conflict do nothing
            `,
            values: {
              tokenSetId: tokenSetInfo.id,
              collectionId: collection.id,
            },
          });
        }
      }
    }

    if (!tokenSetInfo) {
      // Skip if nothing matched so far
      continue;
    }

    const side = order.params.side === 0 ? "buy" : "sell";

    let value: string;
    if (side === "buy") {
      // For buy orders, we set the value as `price - fee` since it's
      // best for UX to show the user exactly what they're going to
      // receive on offer acceptance (and that is `price - fee` and
      // not `price`)
      const fee = order.params.takerRelayerFee;
      value = bn(order.params.basePrice)
        .sub(bn(order.params.basePrice).mul(bn(fee)).div(10000))
        .toString();
    } else {
      // For sell orders, the value is the same as the price
      value = order.params.basePrice;
    }

    // Handle fees

    const feeBps = Math.max(
      order.params.makerRelayerFee,
      order.params.takerRelayerFee
    );

    let sourceInfo;
    switch (order.params.feeRecipient) {
      // OpenSea
      case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": {
        sourceInfo = {
          id: "opensea",
          bps: 250,
        };
        break;
      }

      // LootExchange
      case "0x8cfdf9e9f7ea8c0871025318407a6f1fbc5d5a18":
      case "0x8e71a0d2cc9c48173d9a9b7d90d6036093212afa": {
        sourceInfo = {
          id: "lootexchange",
          bps: 0,
        };
        break;
      }

      // Unknown
      default: {
        sourceInfo = {
          id: "unknown",
          // Assume everything goes to the order's fee recipient
          bps: feeBps,
        };
        break;
      }
    }

    // Handle royalties

    const royalty: { recipient: string } | null = await db.oneOrNone(
      `
        select
          "c"."royalty_recipient" as "recipient"
        from "collections" "c"
        join "tokens" "t"
          on "c"."id" = "t"."collection_id"
        where "t"."contract" = $/contract/
        limit 1
      `,
      { contract: order.params.target }
    );

    let royaltyInfo;
    if (royalty) {
      // Royalties are whatever is left after subtracting the marketplace fee
      const bps = feeBps - sourceInfo.bps;
      if (bps > 0) {
        royaltyInfo = [
          {
            recipient: royalty.recipient,
            bps: feeBps - sourceInfo.bps,
          },
        ];
      }
    }

    // TODO: Not at all critical, but multi-row inserts could
    // do here to get better insert performance when handling
    // multiple orders
    queries.push({
      query: `
        insert into "orders" (
          "hash",
          "kind",
          "status",
          "side",
          "token_set_id",
          "maker",
          "price",
          "value",
          "valid_between",
          "source_info",
          "royalty_info",
          "raw_data"
        ) values (
          $/hash/,
          $/kind/,
          $/status/,
          $/side/,
          $/tokenSetId/,
          $/maker/,
          $/price/,
          $/value/,
          tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
          $/sourceInfo:json/,
          $/royaltyInfo:json/,
          $/rawData/
        ) on conflict ("hash") do
        update set
          "side" = $/side/,
          "token_set_id" = $/tokenSetId/,
          "maker" = $/maker/,
          "price" = $/price/,
          "value" = $/value/,
          "valid_between" = tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
          "source_info" = $/sourceInfo:json/,
          "royalty_info" = $/royaltyInfo:json/,
          "raw_data" = $/rawData/
      `,
      values: {
        hash: order.prefixHash(),
        kind: "wyvern-v2",
        status: "valid",
        side,
        tokenSetId: tokenSetInfo.id,
        maker: order.params.maker,
        price: order.params.basePrice,
        value,
        listingTime: order.params.listingTime,
        expirationTime:
          order.params.expirationTime == 0
            ? "infinity"
            : order.params.expirationTime,
        sourceInfo,
        royaltyInfo,
        rawData: order.params,
      },
    });
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
  await addToOrdersUpdateByHashQueue(
    orders.map((order) => ({ hash: order.prefixHash() }))
  );
};
