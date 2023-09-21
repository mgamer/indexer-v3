import { AddressZero } from "@ethersproject/constants";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { baseProvider } from "@/common/provider";

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

        let calledByPermit = false;
        const txHash = baseEventParams.txHash;
        const transaction = await utils.fetchTransaction(txHash);

        // Direct permit call
        // 0x8fcbaf0c DAI
        // 0xd505accf ERC20-Permit
        if (transaction.data.includes("0xd505accf")) {
          calledByPermit = true;
        }

        // TODO: need to make sure the approval event is inside of a permit call
        // Nestetd permit call
        if (!calledByPermit) {
          const txTrace = await utils.fetchTransactionTrace(txHash);
          if (!txTrace) {
            break;
          }

          for (let i = 0; i < 20; i++) {
            const permitCall = searchForCall(txTrace.calls, { sigHashes: ["0xd505accf"] }, i);
            if (permitCall) {
              calledByPermit = true;
            }
          }
        }

        if (calledByPermit) {
          const tokenContract = new Contract(
            baseEventParams.address,
            new Interface(["function nonces(address owner) external view returns (uint256)"]),
            baseProvider
          );
          const nonce = await tokenContract.nonces(owner);
          // Cancel all the linked permit-bidding orders below the current nonce
          onChainData.permitApprovalChanges.push({
            owner,
            spender,
            nonce: nonce.toString(),
          });
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
