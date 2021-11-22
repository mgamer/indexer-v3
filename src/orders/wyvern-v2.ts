import { Builders, Helpers, Order, Utils } from "@georgeroman/wyvern-v2-sdk";

import { batchQueries, db } from "@common/db";
import { config } from "@config/index";
import { generateTokenSetId } from "@orders/utils";
import { addToOrdersActionsQueue } from "@jobs/orders-actions";

// Wyvern V2 orders are retrieved from three sources:
// - OpenSea
// - on-chain orderbook
// - off-chain API

type OpenseaOrder = {
  prefixed_hash: string;
  exchange: string;
  metadata: { asset: { id: string; address: string; quantity?: string } };
  created_date: string;
  maker: { address: string };
  taker: { address: string };
  maker_relayer_fee: string;
  taker_relayer_fee: string;
  fee_recipient: { address: string };
  side: number;
  sale_kind: number;
  target: string;
  how_to_call: number;
  calldata: string;
  replacement_pattern: string;
  static_target: string;
  static_extradata: string;
  payment_token: string;
  base_price: string;
  extra: string;
  listing_time: number;
  expiration_time: number;
  salt: string;
  v?: number;
  r?: string;
  s?: string;
};

export const parseOpenseaOrder = (openseaOrder: OpenseaOrder) => {
  try {
    let order: Order | undefined;
    if (openseaOrder.metadata.asset.quantity) {
      // erc1155
      order = (
        openseaOrder.side === 0
          ? Builders.Erc1155.SingleItem.buy
          : Builders.Erc1155.SingleItem.sell
      )({
        exchange: openseaOrder.exchange,
        maker: openseaOrder.maker.address,
        target: openseaOrder.metadata.asset.address,
        tokenId: openseaOrder.metadata.asset.id,
        paymentToken: openseaOrder.payment_token,
        basePrice: openseaOrder.base_price,
        fee:
          openseaOrder.side === 0
            ? openseaOrder.taker_relayer_fee
            : openseaOrder.maker_relayer_fee,
        feeRecipient: openseaOrder.fee_recipient.address,
        listingTime: openseaOrder.listing_time.toString(),
        expirationTime: openseaOrder.expiration_time.toString(),
        salt: openseaOrder.salt,
        extra: openseaOrder.extra,
        v: openseaOrder.v,
        r: openseaOrder.r,
        s: openseaOrder.s,
      });
    } else {
      // erc721
      order = (
        openseaOrder.side === 0
          ? Builders.Erc721.SingleItem.buy
          : Builders.Erc721.SingleItem.sell
      )({
        exchange: openseaOrder.exchange,
        maker: openseaOrder.maker.address,
        target: openseaOrder.metadata.asset.address,
        tokenId: openseaOrder.metadata.asset.id,
        paymentToken: openseaOrder.payment_token,
        basePrice: openseaOrder.base_price,
        fee:
          openseaOrder.side === 0
            ? openseaOrder.taker_relayer_fee
            : openseaOrder.maker_relayer_fee,
        feeRecipient: openseaOrder.fee_recipient.address,
        listingTime: openseaOrder.listing_time.toString(),
        expirationTime: openseaOrder.expiration_time.toString(),
        salt: openseaOrder.salt,
        extra: openseaOrder.extra,
        v: openseaOrder.v,
        r: openseaOrder.r,
        s: openseaOrder.s,
      });
    }

    // Check that the hashes match, just in case
    if (order && openseaOrder.prefixed_hash !== Helpers.Order.hash(order)) {
      return undefined;
    }

    return order;
  } catch {
    return undefined;
  }
};

export const parseEncodedOrder = (encodedOrder: string) => {
  return Helpers.Order.decode(encodedOrder);
};

// Enhance orders with their token id (which is missing from
// the default Wyvern V2 order format)
type EnhancedOrder = Order & {
  tokenId: string;
};

export const filterOrders = async (
  orders: Order[]
): Promise<EnhancedOrder[]> => {
  if (!orders.length) {
    return [];
  }

  // Get the kinds of all contracts targeted by the orders
  const contracts: { address: string; kind: string }[] = await db.manyOrNone(
    `select distinct "address", "kind" from "contracts" where "address" in ($1:csv)`,
    [orders.map((order) => order.target)]
  );

  const contractKinds = new Map<string, string>();
  for (const { address, kind } of contracts) {
    contractKinds.set(address, kind);
  }

  // Get all orders we're already storing
  const hashes: { hash: string }[] = await db.manyOrNone(
    `select "hash" from "orders" where "hash" in ($1:csv) and "token_set_id" is not null`,
    [orders.map((order) => Helpers.Order.hash(order))]
  );

  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  // Validate orders
  const validOrders: EnhancedOrder[] = [];
  for (const order of orders) {
    // Check: order doesn't already exist
    if (existingHashes.has(Helpers.Order.hash(order))) {
      continue;
    }

    // Check: order is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = Number(order.expirationTime);
    if (expirationTime !== 0 && currentTime > expirationTime) {
      // continue;
    }

    // Check: sell order has ETH as payment token
    if (
      order.side === 1 &&
      order.paymentToken !== Utils.Address.eth(config.chainId)
    ) {
      continue;
    }

    // Check: buy order has WETH as payment token
    if (
      order.side === 0 &&
      order.paymentToken !== Utils.Address.weth(config.chainId)
    ) {
      continue;
    }

    // Check: order has a valid exchange
    if (order.exchange !== Utils.Address.wyvernV2(config.chainId)) {
      continue;
    }

    // Signature validation is delayed as much as possible since it's
    // the costliest operation and we don't want to run it unless every
    // other check passed.

    // Check: erc721 order is well formatted
    const isErc721SingleItem =
      Builders.Erc721.SingleItem.isWellFormatted(order);
    if (isErc721SingleItem && contractKinds.get(order.target) === "erc721") {
      const tokenId = Builders.Erc721.SingleItem.extractTokenId(order)!;

      // Check: order targets a known token
      const tokenExists = await db.oneOrNone(
        `select 1 from "tokens" where "contract" = $/contract/ and "token_id" = $/tokenId/`,
        {
          contract: order.target,
          tokenId,
        }
      );
      if (tokenExists) {
        // Check: order has a valid signature
        if (!Helpers.Order.verifySignature(order)) {
          continue;
        }

        validOrders.push({
          ...order,
          tokenId,
        });
      }

      continue;
    }

    // Check: erc1155 order is well formatted
    const isErc1155SingleItem =
      Builders.Erc1155.SingleItem.isWellFormatted(order);
    if (isErc1155SingleItem && contractKinds.get(order.target) === "erc1155") {
      const tokenId = Builders.Erc1155.SingleItem.extractTokenId(order)!;

      // Check: order targets a known token
      const tokenExists = await db.oneOrNone(
        `select 1 from "tokens" where "contract" = $/contract/ and "token_id" = $/tokenId/`,
        {
          contract: order.target,
          tokenId,
        }
      );
      if (tokenExists) {
        // Check: order has a valid signature
        if (!Helpers.Order.verifySignature(order)) {
          continue;
        }

        validOrders.push({
          ...order,
          tokenId,
        });
      }

      continue;
    }
  }

  return validOrders;
};

export const saveOrders = async (orders: EnhancedOrder[]) => {
  if (!orders.length) {
    return;
  }

  const queries: any[] = [];
  for (const order of orders) {
    // Generate the token set id corresponding to the order
    const tokenSetId = generateTokenSetId([
      {
        contract: order.target,
        tokenId: order.tokenId,
      },
    ]);

    // Make sure the token set exists
    queries.push({
      query: `insert into "token_sets" ("id") values ($/tokenSetId/) on conflict do nothing`,
      values: { tokenSetId },
    });
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
        ) on conflict do nothing`,
      values: {
        tokenSetId,
        contract: order.target,
        tokenId: order.tokenId,
      },
    });

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
            "valid_between",
            "raw_data"
          ) values (
            $/hash/,
            $/kind/,
            $/status/,
            $/side/,
            $/tokenSetId/,
            $/maker/,
            $/price/,
            tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
            $/rawData/
          ) on conflict ("hash") do
          update set
            "token_set_id" = $/tokenSetId/,
            "maker" = $/maker/,
            "price" = $/price/,
            "valid_between" = tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
            "raw_data" = $/rawData/
        `,
      values: {
        hash: Helpers.Order.hash(order),
        kind: "wyvern-v2",
        status: "valid",
        side: order.side === 0 ? "buy" : "sell",
        tokenSetId,
        maker: order.maker,
        price: order.basePrice,
        listingTime: order.listingTime,
        expirationTime:
          order.expirationTime == "0" ? "infinity" : order.expirationTime,
        rawData: order,
      },
    });
  }

  await batchQueries(queries);
  await addToOrdersActionsQueue(
    orders.map((order) => Helpers.Order.hash(order))
  );
};
