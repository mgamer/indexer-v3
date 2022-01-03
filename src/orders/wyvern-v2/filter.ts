import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { db } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

export const filterOrders = async (
  orders: Sdk.WyvernV2.Order[]
): Promise<Sdk.WyvernV2.Order[]> => {
  if (!orders.length) {
    return [];
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
