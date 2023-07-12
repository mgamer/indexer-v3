import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { ExecutionInfo } from "./types";
import { isETH, isWETH } from "./utils";
import { Weth } from "../../common/addresses";
import { bn } from "../../utils";

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
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    swapModule: Contract;
    baseSwapModule: Contract;
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
          module: options.baseSwapModule.address,
          data: options.baseSwapModule.interface.encodeFunctionData("wrap", [options.transfers]),
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
          module: options.baseSwapModule.address,
          data: options.baseSwapModule.interface.encodeFunctionData("unwrap", [options.transfers]),
          value: 0,
        },
      ],
    };
  } else {
    // We need to swap
    const fromToken = isETH(chainId, fromTokenAddress) ? Weth[chainId] : fromTokenAddress;
    const toToken = isETH(chainId, toTokenAddress) ? Weth[chainId] : toTokenAddress;

    const oneInchAPI = "https://api.1inch.io";
    const slippage = 10; // 0.01%
    const { data: quoteData } = await axios.get(`${oneInchAPI}/v5.0/${chainId}/quote`, {
      params: {
        toTokenAddress: fromToken,
        fromTokenAddress: toToken,
        amount: bn(toTokenAmount)
          .add(bn(toTokenAmount).mul(slippage).div(bn(1000)))
          .toString(),
      },
    });

    const { data: swapData } = await axios.get(`${oneInchAPI}/v5.0/${chainId}/swap`, {
      params: {
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount: quoteData.toTokenAmount,
        disableEstimate: true,
        fromAddress: options.swapModule.address,
        slippage: slippage / 10,
      },
    });

    const fromETH = isETH(chainId, fromTokenAddress);
    const executions: ExecutionInfo[] = [];

    if (fromETH) {
      // wrap ETH to ETH
      executions.push({
        module: options.baseSwapModule.address,
        data: options.baseSwapModule.interface.encodeFunctionData("wrap", [
          [
            {
              recipient: options.swapModule.address,
              amount: swapData.fromTokenAmount,
            },
          ],
        ]),
        value: swapData.fromTokenAmount,
      });
    }

    executions.push({
      module: options.swapModule.address,
      data: options.swapModule.interface.encodeFunctionData("erc20ToExactOutput", [
        {
          params: {
            tokenIn: swapData.fromToken.address,
            tokenOut: swapData.toToken.address,
            amountOut: swapData.toTokenAmount,
            amountInMaximum: swapData.fromTokenAmount,
            data: swapData.tx.data,
          },
          transfers: options.transfers,
        },
        options.refundTo,
      ]),
      value: 0,
    });
    return {
      amountIn: swapData.fromTokenAmount.toString(),
      executions,
    };
  }
};
