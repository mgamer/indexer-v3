import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { db } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

type FilterResult = {
  validOrders: Sdk.WyvernV2.Order[];
  invalidOrders: {
    order: Sdk.WyvernV2.Order;
    reason: string;
  }[];
};

export const filterOrders = async (
  orders: Sdk.WyvernV2.Order[]
): Promise<FilterResult> => {
  const result: FilterResult = {
    validOrders: [],
    invalidOrders: [],
  };

  if (!orders.length) {
    return result;
  }

  // Get the kinds of all contracts targeted by the orders
  const contracts: { address: string; kind: string }[] = await db.manyOrNone(
    `
      select distinct
        "c"."address",
        "c"."kind"
      from "contracts" "c"
      where "c"."address" in ($1:csv)
    `,
    [orders.map((order) => order.params.target)]
  );

  const contractKinds = new Map<string, string>();
  for (const { address, kind } of contracts) {
    contractKinds.set(address, kind);
  }

  // Get all orders we're already storing
  const hashes: { hash: string }[] = await db.manyOrNone(
    `
      select "o"."hash"
      from "orders" "o"
      where "o"."hash" in ($1:csv)
    `,
    [orders.map((order) => order.prefixHash())]
  );

  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  for (const order of orders) {
    const hash = order.prefixHash();

    // Check: order doesn't already exist
    if (existingHashes.has(hash)) {
      result.invalidOrders.push({ order, reason: "Order already exists" });
      continue;
    }

    // Check: order has a valid target
    if (
      !order.params.kind?.startsWith(contractKinds.get(order.params.target)!)
    ) {
      result.invalidOrders.push({
        order,
        reason: "Order has unsupported target",
      });
      continue;
    }

    // Check: order is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = order.params.expirationTime;
    if (expirationTime !== 0 && currentTime >= expirationTime) {
      result.invalidOrders.push({ order, reason: "Order is expired" });
      continue;
    }

    // Check: order has a non-zero fee recipient
    if (order.params.feeRecipient === AddressZero) {
      result.invalidOrders.push({ order, reason: "Fee recipient is zero" });
      continue;
    }

    // Check: buy order has Weth as payment token
    if (
      order.params.side === 0 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
    ) {
      result.invalidOrders.push({
        order,
        reason: "Order has unsupported payment token",
      });
      continue;
    }

    // Check: sell order has Eth as payment token
    if (
      order.params.side === 1 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
    ) {
      result.invalidOrders.push({
        order,
        reason: "Order has unsupported payment token",
      });
      continue;
    }

    // Check: order is not private
    if (order.params.taker !== AddressZero) {
      result.invalidOrders.push({
        order,
        reason: "Order is private",
      });
      continue;
    }

    // Check: order is valid
    try {
      order.checkValidity();
    } catch {
      result.invalidOrders.push({
        order,
        reason: "Order is invalid",
      });
      continue;
    }

    // Check: order has a valid signature
    try {
      await order.checkSignature();
    } catch {
      result.invalidOrders.push({
        order,
        reason: "Order has invalid signature",
      });
      continue;
    }

    // Check: order is fillable
    try {
      await order.checkFillability(baseProvider);
    } catch {
      result.invalidOrders.push({
        order,
        reason: "Order is not fillable",
      });
      continue;
    }

    result.validOrders.push(order);
  }

  return result;
};
