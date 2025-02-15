import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther } from "@ethersproject/units";

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const formatEth = (wei: BigNumberish) =>
  Number(Number(formatEther(wei)).toFixed(5));
