import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import { PendingToken } from "../types";

export async function parseTokensFromCalldata(calldata: string) {
  const parsedOrders = await extractOrdersFromCalldata(calldata);
  return parsedOrders
    .map((c) => {
      return {
        contract: c.contract,
        tokenId: c.tokenId,
      };
    })
    .filter((c) => c.tokenId) as PendingToken[];
}
