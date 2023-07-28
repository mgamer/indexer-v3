import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getMidaswapPool, saveMidaswapPool } from "@/models/midaswap-pools";

import PairAbi from "@reservoir0x/sdk/dist/midaswap/abis/Pair.json";

export const getPoolDetails = async (address: string) =>
  getMidaswapPool(address).catch(async () => {
    if (Sdk.Midaswap.Addresses.PairFactory[config.chainId]) {
      try {
        const pool = new Contract(address, PairAbi, baseProvider);
        const nft = (await pool.getTokenX()).toLowerCase();
        const token = (await pool.getTokenY()).toLowerCase();
        const [freeRate, , royaltyRate] = (await pool.feeParameters()) as BigNumber[];

        return saveMidaswapPool({
          address,
          nft,
          token,
          freeRateBps: freeRate.div(Math.pow(10, 14)).toNumber(),
          royaltyBps: royaltyRate.div(Math.pow(10, 14)).toNumber(),
        });
      } catch {
        // Skip any errors
      }
    }
  });
