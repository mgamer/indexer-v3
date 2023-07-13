import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";
import { ExecutionInfo } from "../types";
import { isETH, isWETH } from "../utils";

import * as uniswap from "./uniswap";
import * as oneInch from "./1inch";

export type SwapInfo = {
  amountIn: BigNumberish;
  executions: ExecutionInfo[];
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
    swapModule: Contract;
    swap1inchModule: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  if (isETH(chainId, fromTokenAddress) && isWETH(chainId, toTokenAddress)) {
    // We need to wrap ETH
    return {
      amountIn: toTokenAmount,
      executions: [
        {
          module: options.swapModule.address,
          data: options.swapModule.interface.encodeFunctionData("wrap", [options.transfers]),
          value: toTokenAmount,
        },
      ],
    };
  } else if (isWETH(chainId, fromTokenAddress) && isETH(chainId, toTokenAddress)) {
    // We need to unwrap WETH
    return {
      amountIn: toTokenAmount,
      executions: [
        {
          module: options.swapModule.address,
          data: options.swapModule.interface.encodeFunctionData("unwrap", [options.transfers]),
          value: 0,
        },
      ],
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
            swapModule: options.swapModule,
            transfers: options.transfers,
            refundTo: options.refundTo,
          }
        )
      : await oneInch.generateSwapExecutions(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          toTokenAmount,
          {
            swap1inchModule: options.swap1inchModule,
            baseSwapModule: options.swapModule,
            transfers: options.transfers,
            refundTo: options.refundTo,
          }
        );
  }
};
