import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { Royalty } from "@/utils/royalties";

// We use the Sudoswap default:
// https://etherscan.io/address/0x844d04f79d2c58dcebf8fff1e389fccb1401aa49#readContract#F1
const DEFAULT_TOKEN_ID =
  "15071168992173782429442913374966825982917717686782717242083813486423797878870";
const DEFAULT_PRICE = "1000000000000000000";

// Assume there are no per-token royalties but everything is per-contract
export const refreshEIP2981Royalties = async (contract: string): Promise<Royalty[]> => {
  let lookupAddress = contract;
  if (Sdk.Common.Addresses.RoyaltyRegistry[config.chainId]) {
    const royaltyRegistry = new Contract(
      Sdk.Common.Addresses.RoyaltyRegistry[config.chainId],
      new Interface([
        `
          function getRoyaltyLookupAddress(
            address token
          ) external view returns (address)
        `,
      ]),
      baseProvider
    );
    lookupAddress = await royaltyRegistry.getRoyaltyLookupAddress(contract);
  }

  const lookup = new Contract(
    lookupAddress,
    new Interface([
      `
        function royaltyInfo(
          uint256 tokenId,
          uint256 salePrice
        ) external view returns (
          address receiver,
          uint256 amount
        )
      `,
    ]),
    baseProvider
  );

  try {
    // The royalties are returned in full amounts, but we store them as a percentage
    // so here we just use a default price (which is a round number) and deduce then
    // deduce the percentage taken as royalties from that
    const result = await lookup.royaltyInfo(DEFAULT_TOKEN_ID, DEFAULT_PRICE);

    const recipient = result.receiver.toLowerCase();
    const amount = result.amount;
    if (bn(amount).gte(DEFAULT_PRICE)) {
      throw new Error("Royalty exceeds price");
    }

    const bps = Math.round(bn(amount).mul(10000).div(DEFAULT_PRICE).toNumber());

    const latestRoyalties = [
      {
        recipient,
        bps,
      },
    ];

    const royaltiesResult = await idb.oneOrNone(
      `
        SELECT
          COALESCE(collections.new_royalties, '{}') AS royalties
        FROM collections
        WHERE collections.id = $/contract/
      `,
      { contract }
    );
    if (royaltiesResult) {
      if (!_.isEqual(royaltiesResult.royalties["eip2981"], latestRoyalties)) {
        royaltiesResult.royalties["eip2981"] = latestRoyalties;

        await idb.none(
          `
            UPDATE collections SET
              new_royalties = $/royalties:json/
            WHERE collections.id = $/contract/
          `,
          {
            contract,
            royalties: royaltiesResult.royalties,
          }
        );
      }
    }

    return latestRoyalties;
  } catch {
    // Skip any errors
  }

  return [];
};
