import { Builders, Helpers, Order, Utils } from "@georgeroman/wyvern-v2-sdk";

import { bn } from "@/common/bignumber";
import { db, pgp } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { generateTokenSetId } from "@/orders/utils";
import { addToOrdersUpdateByHashQueue } from "@/jobs/orders-update";

// Wyvern V2 orders are retrieved from two different sources:
// - On-chain orderbook
// - Off-chain api

// On-chain orderbook order

export const parseOrderbookOrder = (encodedOrder: string) => {
  return Helpers.Order.decode(encodedOrder);
};

// Off-chain api order

export const parseApiOrder = (order: Order) => {
  try {
    return parseOrderbookOrder(Helpers.Order.encode(order));
  } catch {
    return undefined;
  }
};

// Enhance orders with some extra fields which are missing
// from the default Wyvern V2 order formar
type EnhancedOrder = Order & {
  hash: string;
  tokenId: string;
};

const checkBalance = async (order: EnhancedOrder) => {
  if (order.side === 0) {
    // For buy orders, we check that the maker has enough
    // balance of `paymentToken` (an erc20) to cover the
    // quoted price. The payment token will be weth for
    // all orders in our case.

    const hasBalance = await db.oneOrNone(
      `
        select 1 from "ownerships"
        where "contract" = $/contract/
          and "token_id" = $/tokenId/
          and "owner" = $/owner/
          and "amount" > $/price/
      `,
      {
        contract: order.paymentToken,
        tokenId: "-1",
        owner: order.maker,
        price: order.basePrice,
      }
    );

    if (!hasBalance) {
      return false;
    }

    return true;
  } else {
    // For sell orders, we check that the maker holds the
    // quoted token (either erc721 or erc1155)

    const hasBalance = await db.oneOrNone(
      `
        select 1 from "ownerships"
        where "contract" = $/contract/
          and "token_id" = $/tokenId/
          and "owner" = $/owner/
          and "amount" > 0
      `,
      {
        contract: order.target,
        tokenId: order.tokenId,
        owner: order.maker,
      }
    );

    if (!hasBalance) {
      return false;
    }

    return true;
  }
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
    `select "hash" from "orders" where "hash" in ($1:csv)`,
    [orders.map((order) => Helpers.Order.hash(order))]
  );

  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  // Validate orders
  const validOrders: EnhancedOrder[] = [];
  for (const order of orders) {
    const hash = Helpers.Order.hash(order);

    // Check: order doesn't already exist
    if (existingHashes.has(hash)) {
      continue;
    }

    // Check: order is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = Number(order.expirationTime);
    if (expirationTime !== 0 && currentTime > expirationTime) {
      continue;
    }

    // Check: buy order has WETH as payment token
    if (
      order.side === 0 &&
      order.paymentToken !== Utils.Address.weth(config.chainId)
    ) {
      continue;
    }

    // Check: sell order has ETH as payment token
    if (
      order.side === 1 &&
      order.paymentToken !== Utils.Address.eth(config.chainId)
    ) {
      continue;
    }

    // Check: order is not private
    if (order.taker !== "0x0000000000000000000000000000000000000000") {
      continue;
    }

    // Check: order has a valid exchange
    if (order.exchange !== Utils.Address.exchange(config.chainId)) {
      continue;
    }

    // Check: erc721 order is well formatted
    const isErc721SingleItem =
      Builders.Erc721.SingleItem.isWellFormatted(order);
    if (isErc721SingleItem && contractKinds.get(order.target) === "erc721") {
      const tokenId = Builders.Erc721.SingleItem.extractTokenId(order)!;
      const enhancedOrder = { ...order, hash, tokenId };

      // Check: order has a valid signature
      if (!Helpers.Order.verifySignature(order)) {
        continue;
      }

      // Check: the maker has the proper balance
      if (!(await checkBalance(enhancedOrder))) {
        continue;
      }

      // Check: the maker has set the proper approval
      if (!(await Helpers.Order.isApproved(baseProvider, order))) {
        continue;
      }

      validOrders.push(enhancedOrder);
      continue;
    }

    // Check: erc1155 order is well formatted
    const isErc1155SingleItem =
      Builders.Erc1155.SingleItem.isWellFormatted(order);
    if (isErc1155SingleItem && contractKinds.get(order.target) === "erc1155") {
      const tokenId = Builders.Erc1155.SingleItem.extractTokenId(order)!;
      const enhancedOrder = { ...order, hash, tokenId };

      // Check: order has a valid signature
      if (!Helpers.Order.verifySignature(order)) {
        continue;
      }

      // Check: the maker has the proper balance
      if (!(await checkBalance(enhancedOrder))) {
        continue;
      }

      // Check: the maker has set the proper approval
      if (!(await Helpers.Order.isApproved(baseProvider, order))) {
        continue;
      }

      validOrders.push(enhancedOrder);
      continue;
    }
  }

  return validOrders;
};

export const saveOrders = async (orders: EnhancedOrder[]) => {
  // TODO: The order inserts could do some batching in order
  // to improve the performance

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

    const side = order.side === 0 ? "buy" : "sell";

    let value: string;
    if (side === "buy") {
      // For buy orders, we set the value as price - fee since it's
      // best for UX to show the user exactly what they're going
      // to receive on offer acceptance (and that is price - fee)
      const fee = order.takerRelayerFee;
      value = bn(order.basePrice)
        .sub(bn(order.basePrice).mul(bn(fee)).div(10000))
        .toString();
    } else {
      // For sell orders, the value is the same as the price
      value = order.basePrice;
    }

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
          $/rawData/
        ) on conflict ("hash") do
        update set
          "side" = $/side/,
          "token_set_id" = $/tokenSetId/,
          "maker" = $/maker/,
          "price" = $/price/,
          "value" = $/value/,
          "valid_between" = tstzrange(to_timestamp($/listingTime/), to_timestamp($/expirationTime/)),
          "raw_data" = $/rawData/
      `,
      values: {
        hash: Helpers.Order.hash(order),
        kind: "wyvern-v2",
        status: "valid",
        side,
        tokenSetId,
        maker: order.maker,
        price: order.basePrice,
        value,
        listingTime: order.listingTime,
        expirationTime:
          order.expirationTime == "0" ? "infinity" : order.expirationTime,
        rawData: order,
      },
    });
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
  await addToOrdersUpdateByHashQueue(orders);
};
