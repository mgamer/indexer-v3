import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  getNftxFtPool,
  getNftxNftPool,
  saveNftxFtPool,
  saveNftxNftPool,
} from "@/models/nftx-pools";

export const getNftPoolDetails = async (address: string) =>
  getNftxNftPool(address).catch(async () => {
    if (Sdk.Nftx.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function assetAddress() view returns (address)",
        "function vaultId() view returns (uint256)",
        "function vault(uint256) view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const nft = await pool.assetAddress();
        const vaultId = await pool.vaultId();

        const factory = new Contract(
          Sdk.Nftx.Addresses.VaultFactory[config.chainId],
          iface,
          baseProvider
        );
        if ((await factory.vaultAddress(vaultId)).toLowerCase() === address) {
          return saveNftxNftPool({
            address,
            nft,
            vaultId,
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });

export const getFtPoolDetails = async (address: string) =>
  getNftxFtPool(address).catch(async () => {
    if (Sdk.Nftx.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const token0 = await pool.token0();
        const token1 = await pool.token1();

        return saveNftxFtPool({
          address,
          token0,
          token1,
        });
      } catch {
        // Skip any errors
      }
    }
  });
