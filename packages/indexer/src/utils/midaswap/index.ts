import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getMidaswapPool, saveMidaswapPool } from "@/models/midaswap-pools";

export const getPoolDetails = async (address: string) =>
  getMidaswapPool(address).catch(async () => {
    if (Sdk.Midaswap.Addresses.PairFactory[config.chainId]) {
      try {
        const pool = new Contract(address, Sdk.Midaswap.PairAbi, baseProvider);
        const nft = (await pool.getTokenX()).toLowerCase();
        const token = (await pool.getTokenY()).toLowerCase();
        const [freeRate, , royaltyRate] = (await pool.feeParameters()) as BigNumber[];

        return saveMidaswapPool({
          address,
          nft,
          token,
          freeRate: (+freeRate.toString() / Math.pow(10, 14)).toString(),
          royalty: (+royaltyRate.toString() / Math.pow(10, 14)).toString(),
        });
      } catch {
        // Skip any errors
      }
    }
  });
