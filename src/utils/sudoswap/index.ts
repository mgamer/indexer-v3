import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getSudoswapPool, saveSudoswapPool } from "@/models/sudoswap-pools";

export const getPoolDetails = async (poolContract: string) =>
  getSudoswapPool(poolContract).catch(async () => {
    if (Sdk.Sudoswap.Addresses.PairFactory[config.chainId]) {
      const iface = new Interface([
        "function nft() view returns (address)",
        "function token() view returns (address)",
        "function bondingCurve() view returns (address)",
        "function poolType() view returns (uint8)",
        "function pairVariant() view returns (uint8)",
        "function isPair(address pair, uint8 variant) view returns (bool)",
      ]);

      try {
        const pool = new Contract(poolContract, iface, baseProvider);

        const nftContract = await pool.nft();
        const bondingCurveContract = await pool.bondingCurve();
        const poolKind = await pool.poolType();
        const pairKind = await pool.pairVariant();
        const tokenContract = pairKind > 1 ? await pool.token() : AddressZero;

        const factory = new Contract(
          Sdk.Sudoswap.Addresses.PairFactory[config.chainId],
          iface,
          baseProvider
        );
        if (await factory.isPair(poolContract, pairKind)) {
          return saveSudoswapPool({
            poolContract,
            nftContract,
            tokenContract,
            bondingCurveContract,
            poolKind,
            pairKind,
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });
