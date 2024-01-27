import { Interface } from "@ethersproject/abi";
import { PendingToken } from "@/utils/pending-txs/types";
import ExchangeAbi from "@reservoir0x/sdk/dist/blur/abis/Exchange.json";

export const parseTokensFromCalldata = async (calldata: string): Promise<PendingToken[]> => {
  const parsedTokens: PendingToken[] = [];
  try {
    const exchangeIface = new Interface(ExchangeAbi);
    // Parse top level call
    const { name: funcName, args } = exchangeIface.parseTransaction({
      data: calldata,
    });

    let executions = [];
    if (["execute"].includes(funcName)) {
      executions = [args];
    } else if (["bulkExecute"].includes(funcName)) {
      executions = args.executions;
    }

    for (let i = 0; i < executions.length; i++) {
      try {
        const { sell, buy } = executions[i];
        const sellTokenId = sell.order.tokenId.toString();
        const buyTokenId = buy.order.tokenId.toString();
        const contract = buy.order.collection;
        parsedTokens.push({
          contract: contract,
          tokenId: sellTokenId || buyTokenId,
        });
      } catch {
        // Skip erros
      }
    }
  } catch {
    // Skip errors
  }

  return parsedTokens;
};
