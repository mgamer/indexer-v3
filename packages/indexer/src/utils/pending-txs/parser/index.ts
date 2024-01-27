import { PendingToken } from "@/utils/pending-txs/types";

import * as paymentProcessorV2 from "@/utils/pending-txs/parser/payment-processor-v2";
import * as seaport from "@/utils/pending-txs/parser/seaport";
import * as blur from "@/utils/pending-txs/parser/blur";

export const parseTokensFromCalldata = async (calldata: string): Promise<PendingToken[]> => {
  const [ppv2Results, seaportResults, blurResults] = await Promise.all([
    paymentProcessorV2.parseTokensFromCalldata(calldata),
    seaport.parseTokensFromCalldata(calldata),
    blur.parseTokensFromCalldata(calldata),
  ]);
  return ppv2Results.concat(seaportResults).concat(blurResults);
};
