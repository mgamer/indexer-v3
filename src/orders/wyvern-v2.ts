import { Builders, Helpers, Order, Utils } from "@georgeroman/wyvern-v2-sdk";

import { db, pgp } from "../common/db";
import { redis } from "../common/redis";
import { config } from "../config";

export const parseOrderbookOrder = (encodedOrder: string) => {
  return Helpers.Order.decode(encodedOrder);
};

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

type EnhancedOrder = Order & {
  tokenId: string;
};

export const filterOrders = async (
  orders: Order[]
): Promise<EnhancedOrder[]> => {
  if (!orders.length) {
    return [];
  }

  const contracts: { address: string; kind: string }[] = await db.manyOrNone(
    `select distinct "address", "kind" from "contracts" where "address" in ($1:csv)`,
    [orders.map((order) => order.target)]
  );

  // Get the kinds of all contracts targeted by the orders
  const contractKinds = new Map<string, string>();
  for (const { address, kind } of contracts) {
    contractKinds.set(address, kind);
  }

  const hashes: { hash: string }[] = await db.manyOrNone(
    `select "hash" from "sell_orders" where "hash" in ($1:csv) and "contract" is not null`,
    [orders.map((order) => Helpers.Order.hash(order))]
  );

  // Get the hashes of all orders that are already stored
  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  const enhancedOrders: EnhancedOrder[] = [];
  for (const order of orders) {
    // Make sure the order has a valid signature
    if (!Helpers.Order.verifySignature(order)) {
      continue;
    }

    // Make sure the order is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = Number(order.expirationTime);
    if (expirationTime !== 0 && currentTime > expirationTime) {
      continue;
    }

    // Make sure the order doesn't already exist
    if (existingHashes.has(Helpers.Order.hash(order))) {
      continue;
    }

    // Only allow ETH sell orders
    if (
      order.side === 1 &&
      order.paymentToken !== Utils.Address.eth(config.chainId)
    ) {
      continue;
    }

    // For now, disallow buy orders
    if (order.side === 0) {
      continue;
    }

    // // Only allow WETH buy orders
    // if (order.side === 0 && order.paymentToken !== Utils.Address.weth(config.chainId)) {
    //   continue;
    // }

    // Make sure the order has a valid exchange
    if (order.exchange !== Utils.Address.wyvernV2(config.chainId)) {
      continue;
    }

    const isErc721SingleItem =
      Builders.Erc721.SingleItem.isWellFormatted(order);
    if (isErc721SingleItem && contractKinds.get(order.target) === "erc721") {
      enhancedOrders.push({
        ...order,
        tokenId: Builders.Erc721.SingleItem.extractTokenId(order)!,
      });
      continue;
    }

    const isErc1155SingleItem =
      Builders.Erc1155.SingleItem.isWellFormatted(order);
    if (isErc1155SingleItem && contractKinds.get(order.target) === "erc1155") {
      enhancedOrders.push({
        ...order,
        tokenId: Builders.Erc1155.SingleItem.extractTokenId(order)!,
      });
      continue;
    }
  }

  return enhancedOrders;
};

export const storeOrders = async (orders: EnhancedOrder[]) => {
  if (!orders.length) {
    return;
  }

  const inserts: any[] = [];
  for (const order of orders) {
    inserts.push({
      query: `
        insert into "sell_orders" (
          "hash",
          "kind",
          "status",
          "contract",
          "token_id",
          "maker",
          "price",
          "valid_between",
          "raw_data"
        ) values (
          $/hash/,
          $/kind/,
          $/status/,
          $/contract/,
          $/tokenId/,
          $/maker/,
          $/price/,
          tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
          $/rawData/
        ) on conflict ("hash") do
        update set
          "contract" = $/contract/,
          "token_id" = $/tokenId/,
          "maker" = $/maker/,
          "price" = $/price/,
          "valid_between" = tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
          "raw_data" = $/rawData/
      `,
      values: {
        hash: Helpers.Order.hash(order),
        kind: "wyvern-v2",
        status: "valid",
        contract: order.target,
        tokenId: order.tokenId,
        maker: order.maker,
        price: order.basePrice,
        listingTime: order.listingTime,
        expirationTime:
          order.expirationTime == "0" ? "infinity" : order.expirationTime,
        rawData: order,
      },
    });
  }

  await db.none(pgp.helpers.concat(inserts));
};
