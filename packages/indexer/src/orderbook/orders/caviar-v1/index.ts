import { OrderMetadata } from "@/orderbook/orders/utils";
import { keccak256 } from "@ethersproject/solidity";

export const getOrderId = (pool: string, side: "sell" | "buy", tokenId?: string) =>
  side === "buy"
    ? // Buy orders have a single order id per pool
      keccak256(["string", "address", "string"], ["caviar-v1", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["caviar-v1", pool, side, tokenId]);

export type OrderInfo = {
  orderParams: {
    pool: string;
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
    // Misc options
    forceRecheck?: boolean;
  };
  metadata: OrderMetadata;
};
