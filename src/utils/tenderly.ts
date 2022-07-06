/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";

import { config } from "../config/index";

const SIMULATE_URL = `
  https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/simulate
`;

export const genericTaker = "0x0000000000000000000000000000000000000001";

export const simulateBuyTx = async (tokenKind: "erc721" | "erc1155", tx: TxData) => {
  // Simulate the buy transaction
  const simulation = await axios.post(
    SIMULATE_URL,
    {
      network_id: config.chainId.toString(),
      from: tx.from,
      to: tx.to,
      input: tx.data,
      value: BigNumber.from(tx.value).toString(),
      gas_price: "0",
      gas: 1000000,
      state_objects: {
        [genericTaker]: { balance: BigNumber.from(tx.value).add(parseEther("1")).toString() },
      },
    },
    {
      headers: {
        "X-Access-Key": process.env.TENDERLY_ACCESS_KEY as string,
      },
    }
  );

  if (
    (simulation.data as any).transaction.transaction_info.call_trace.error === "execution reverted"
  ) {
    return { success: false };
  }

  let hasTransfer = false;
  for (const { name, inputs } of (simulation.data as any).transaction.transaction_info.logs) {
    if (tokenKind === "erc721" && name === "Transfer" && inputs[1].value === genericTaker) {
      hasTransfer = true;
    } else if (
      tokenKind === "erc1155" &&
      name === "TransferSingle" &&
      inputs[2].value === genericTaker
    ) {
      hasTransfer = true;
    }
  }

  if (!hasTransfer) {
    return { success: false };
  }

  return { success: true };
};
