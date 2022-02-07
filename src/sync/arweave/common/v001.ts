import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";
import * as wyvernV2 from "@/orderbook/orders/wyvern-v2";
import * as tokenList from "@/orderbook/token-sets/token-list";

// Version 0.0.1 of Reservoir Protocol Arweave data:
// - `wyvern-v2` orders
// - `list` token sets

export const processTransactionData = async (transactionData: any) => {
  const orderInfos: wyvernV2.OrderInfo[] = [];
  const tokenSets: tokenList.TokenSet[] = [];

  for (const { kind, data } of transactionData) {
    try {
      if (kind === "wyvern-v2") {
        orderInfos.push({
          order: new Sdk.WyvernV2.Order(config.chainId, data),
          metadata: {
            schemaHash: data.schemaHash,
          },
        });
      } else if (kind === "token-set") {
        tokenSets.push({
          id: data.id,
          schemaHash: data.schemaHash,
          schema: data.schema,
          contract: data.contract,
          tokenIds: data.tokenIds,
        });
      }
    } catch {
      // Ignore any errors
    }
  }

  await Promise.all([
    orderbookOrders.addToQueue(orderInfos),
    orderbookTokenSets.addToQueue(tokenSets),
  ]);
};
