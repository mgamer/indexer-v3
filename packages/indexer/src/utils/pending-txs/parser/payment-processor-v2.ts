import { PendingToken } from "../types";
import { Interface, Result } from "@ethersproject/abi";

import ModuleTradesAbi from "@reservoir0x/sdk/dist/payment-processor-v2/abis/ModuleTrades.json";
import ModuleTradesAdvancedAbi from "@reservoir0x/sdk/dist/payment-processor-v2/abis/ModuleTradesAdvanced.json";
import ExchangeAbi from "@reservoir0x/sdk/dist/payment-processor-v2/abis/Exchange.json";

export async function parseTokensFromCalldata(rawCalldata: string): Promise<PendingToken[]> {
  const parsedTokens: PendingToken[] = [];
  try {
    const exchangeIface = new Interface(ExchangeAbi);
    const forwarderIface = new Interface([
      "function forwardCall(address target, bytes calldata message) external payable",
    ]);

    let calldata = rawCalldata;

    const forwardCallSighash = forwarderIface.getSighash("forwardCall");
    // Handle TruestForwarder
    if (rawCalldata.includes(forwardCallSighash)) {
      const parsedForwardCall = forwarderIface.parseTransaction({
        data: rawCalldata,
      });
      calldata = parsedForwardCall.args.message;
    }

    // Parse top level call
    const parsedCall = exchangeIface.parseTransaction({
      data: calldata,
    });

    let iface = new Interface(ModuleTradesAbi);
    let signHash: string | undefined;
    try {
      signHash = iface.getSighash(parsedCall.name);
    } catch {
      // Not in this module
    }

    if (!signHash) {
      // Try another one
      iface = new Interface(ModuleTradesAdvancedAbi);
      signHash = iface.getSighash(parsedCall.name);
    }

    const subCalldata = `${signHash}${parsedCall.args.data.slice(2)}`;

    // Parse sub-module call
    const { name: funcName, args } = iface.parseTransaction({
      data: subCalldata,
    });

    // struct Order[]
    let orders = [];
    if (["buyListing", "acceptOffer"].includes(funcName)) {
      orders.push(args.saleDetails);
    } else if (["bulkBuyListings"].includes(funcName)) {
      orders = args.saleDetailsArray;
    } else if (["bulkAcceptOffers"].includes(funcName)) {
      orders = args.params.saleDetailsArray;
    } else if (["sweepCollection"].includes(funcName)) {
      orders = args.items.map((c: Result) => {
        return {
          tokenAddress: args.sweepOrder.tokenAddress,
          tokenId: c.tokenId,
        };
      });
    }
    for (let i = 0; i < orders.length; i++) {
      try {
        const order = orders[i];
        parsedTokens.push({
          contract: order.tokenAddress,
          tokenId: order.tokenId.toString(),
        });
      } catch {
        // Skip erros
      }
    }
  } catch {
    // Skip errors
  }
  return parsedTokens;
}
