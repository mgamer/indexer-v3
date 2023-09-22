import { Interface } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { MaxUint256, TxData } from "../../utils";
import { TxTags } from "./types";

export const isETH = (chainId: number, address: string) =>
  [Sdk.Common.Addresses.Native[chainId], Sdk.ZeroExV4.Addresses.Native[chainId]].includes(
    address.toLowerCase()
  );

export const isWETH = (chainId: number, address: string) =>
  address.toLowerCase() === Sdk.Common.Addresses.WNative[chainId];

export const generateNFTApprovalTxData = (
  contract: string,
  owner: string,
  operator: string
): TxData => ({
  from: owner,
  to: contract,
  data: new Interface([
    "function setApprovalForAll(address operator, bool isApproved)",
  ]).encodeFunctionData("setApprovalForAll", [operator, true]),
});

export const generateFTApprovalTxData = (
  contract: string,
  owner: string,
  spender: string,
  amount?: BigNumberish
): TxData => ({
  from: owner,
  to: contract,
  data: new Interface(["function approve(address spender, uint256 amount)"]).encodeFunctionData(
    "approve",
    [spender, amount ?? MaxUint256]
  ),
});

export const estimateGas = (txTags: TxTags) => {
  const gasDb = {
    listing: 80000,
    bid: 80000,
    swap: 150000,
    mint: 50000,
    feeOnTop: 30000,
  };

  let estimate = 0;

  // Listings
  for (const count of Object.keys(txTags.listings ?? {})) {
    estimate += Number(count) * gasDb.listing;
  }

  // Bids
  for (const count of Object.keys(txTags.bids ?? {})) {
    estimate += Number(count) * gasDb.bid;
  }

  // Swaps
  estimate += (txTags.swaps ?? 0) * gasDb.swap;

  // Mints
  estimate += (txTags.mints ?? 0) * gasDb.mint;

  // Fees on top
  estimate += (txTags.feesOnTop ?? 0) * gasDb.feeOnTop;

  return estimate;
};
