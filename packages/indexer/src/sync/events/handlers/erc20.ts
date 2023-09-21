import { AddressZero } from "@ethersproject/constants";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { baseProvider } from "@/common/provider";
import * as permitBidding from "@/utils/permit-bidding";
import { bn } from "@/common/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc20-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from,
          to,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${from}-buy-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${to}-buy-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }

      case "erc20-approval": {
        const parsedLog = eventData.abi.parseLog(log);
        const owner = parsedLog.args["owner"].toLowerCase();
        const spender = parsedLog.args["spender"].toLowerCase();

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${owner}-${spender}-buy-approval`,
          maker: owner,
          trigger: {
            kind: "approval-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-approval",
            contract: baseEventParams.address,
            operator: spender,
          },
        });

        const token = baseEventParams.address.toLowerCase();
        const permitBiddingMaxNonce = await permitBidding.getActiveOrdersMaxNonce(owner, token);
        if (permitBiddingMaxNonce) {
          const tokenContract = new Contract(
            baseEventParams.address,
            new Interface(["function nonces(address owner) external view returns (uint256)"]),
            baseProvider
          );
          const nonce = (await tokenContract.nonces(owner)).toString();
          if (bn(permitBiddingMaxNonce).lte(nonce)) {
            onChainData.permitNonceChanges.push({
              token,
              owner,
              spender,
              nonce,
            });
          }
        }

        break;
      }

      case "weth-deposit": {
        const parsedLog = eventData.abi.parseLog(log);
        const to = parsedLog.args["to"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from: AddressZero,
          to,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${to}-buy-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }

      case "weth-withdrawal": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from,
          to: AddressZero,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${from}-buy-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }
    }
  }
};
