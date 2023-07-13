import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { ExecutionInfo } from "../types";
import { isETH } from "../utils";
import { Weth } from "../../../common/addresses";
import { bn } from "../../../utils";
import { TransferDetail, SwapInfo } from "./index";

const API_1INCH_ENDPOINT = "https://api.1inch.io";

export const generateSwapExecutions = async (
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    swap1inchModule: Contract;
    baseSwapModule: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  // We need to swap
  const fromToken = isETH(chainId, fromTokenAddress) ? Weth[chainId] : fromTokenAddress;
  const toToken = isETH(chainId, toTokenAddress) ? Weth[chainId] : toTokenAddress;

  const slippage = 10; // 0.01%
  const { data: quoteData } = await axios.get(`${API_1INCH_ENDPOINT}/v5.0/${chainId}/quote`, {
    params: {
      toTokenAddress: fromToken,
      fromTokenAddress: toToken,
      amount: bn(toTokenAmount)
        .add(bn(toTokenAmount).mul(slippage).div(bn(1000)))
        .toString(),
    },
  });

  const { data: swapData } = await axios.get(`${API_1INCH_ENDPOINT}/v5.0/${chainId}/swap`, {
    params: {
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: quoteData.toTokenAmount,
      disableEstimate: true,
      fromAddress: options.swap1inchModule.address,
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
            recipient: options.swap1inchModule.address,
            amount: swapData.fromTokenAmount,
          },
        ],
      ]),
      value: swapData.fromTokenAmount,
    });
  }

  executions.push({
    module: options.swap1inchModule.address,
    data: options.swap1inchModule.interface.encodeFunctionData("erc20ToExactOutput", [
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
};
