import { PendingToken } from "../types";
import * as paymentProcessorV2 from "./payment-processor-v2";
import * as seaport from "./seaport";

export async function parseTokensFromCalldata(calldata: string): Promise<PendingToken[]> {
  const paymentProcessorTokens = await paymentProcessorV2.parseTokensFromCalldata(calldata);
  const seaportLikeTokens = await seaport.parseTokensFromCalldata(calldata);
  return seaportLikeTokens.concat(paymentProcessorTokens);
}
