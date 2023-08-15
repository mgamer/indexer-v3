import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";

import { ExecutionInfo } from "../types";
import { isETH, isWETH } from "../utils";
import * as oneInch from "./1inch";
import * as uniswap from "./uniswap";

export type SwapInfo = {
  tokenIn: string;
  amountIn: BigNumberish;
  module: Contract;
  execution: ExecutionInfo;
  kind: "wrap-or-unwrap" | "swap";
};

export type TransferDetail = {
  recipient: string;
  amount: BigNumberish;
  toETH: boolean;
};

export const generateSwapExecutions = async (
  chainId: number,
  provider: Provider,
  swapProvider: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  if (isETH(chainId, fromTokenAddress) && isWETH(chainId, toTokenAddress)) {
    // We need to wrap ETH
    return {
      tokenIn: fromTokenAddress,
      amountIn: toTokenAmount,
      module: options.module,
      execution: {
        module: options.module.address,
        data: options.module.interface.encodeFunctionData("wrap", [options.transfers]),
        value: toTokenAmount,
      },

      kind: "wrap-or-unwrap",
    };
  } else if (isWETH(chainId, fromTokenAddress) && isETH(chainId, toTokenAddress)) {
    // We need to unwrap WETH
    return {
      tokenIn: fromTokenAddress,
      amountIn: toTokenAmount,
      module: options.module,
      execution: {
        module: options.module.address,
        data: options.module.interface.encodeFunctionData("unwrap", [options.transfers]),
        value: 0,
      },

      kind: "wrap-or-unwrap",
    };
  } else {
    return swapProvider === "uniswap"
      ? await uniswap.generateSwapExecutions(
          chainId,
          provider,
          fromTokenAddress,
          toTokenAddress,
          toTokenAmount,
          {
            module: options.module,
            transfers: options.transfers,
            refundTo: options.refundTo,
            revertIfIncomplete: options.revertIfIncomplete,
          }
        )
      : await oneInch.generateSwapExecutions(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          toTokenAmount,
          {
            module: options.module,
            transfers: options.transfers,
            refundTo: options.refundTo,
            revertIfIncomplete: options.revertIfIncomplete,
          }
        );
  }
};

export const mergeSwapExecutions = (chainId: number, executions: SwapInfo[]): SwapInfo[] => {
  const results: SwapInfo[] = [];

  const handledIndexes: { [index: number]: boolean } = {};

  // First, we have the `wrap-or-unwrap` executions
  for (let i = 0; i < executions.length; i++) {
    if (handledIndexes[i]) {
      continue;
    }

    if (executions[i].kind === "wrap-or-unwrap") {
      results.push(executions[i]);
      handledIndexes[i] = true;
    }
  }

  // Then, handle the `swap` executions
  for (let i = 0; i < executions.length; i++) {
    if (handledIndexes[i]) {
      continue;
    }

    if (executions[i].kind === "swap") {
      const sameTokenInExecutions: SwapInfo[] = [];
      for (let j = 1; i + j < executions.length; j++) {
        if (handledIndexes[i + j]) {
          continue;
        }

        if (executions[i + j].tokenIn === executions[i].tokenIn) {
          sameTokenInExecutions.push(executions[i + j]);
          handledIndexes[i + j];
        }
      }

      //const fromETH = isETH(chainId, executions[i].tokenIn);

      // const mergedExecutionInfo: ExecutionInfo = executions[i].execution;
      // for (const { execution } of sameTokenInExecutions) {
      //   const { swaps, refundTo, revertIfIncomplete } = executions[
      //     i
      //   ].module.interface.decodeFunctionData(
      //     fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
      //     execution.data
      //   );

      //   mergeSwapExecutions;
      // }
    }
  }

  return results;
};
