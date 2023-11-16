/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

import { config } from "@/config/index";
import { getOpenseaNetworkName } from "@/config/network";

export const tryGetCollectionOpenseaFees = async (
  contract: string,
  tokenId: string,
  timeout = 5000
) => {
  let openseaFees: { [recipient: string]: number } = {};
  let isSuccess = false;
  const headers = {
    headers:
      config.chainId === 5
        ? {
            "Content-Type": "application/json",
          }
        : {
            "Content-Type": "application/json",
            "X-Api-Key": config.openSeaApiKey,
          },
  };

  await Promise.race([
    (async () => {
      const nft: any = await axios.get(
        `https://api.opensea.io/api/v2/chain/${getOpenseaNetworkName()}/contract/${contract}/nfts/${tokenId}`,
        headers
      );

      const collection: any = await axios.get(
        `https://api.opensea.io/api/v2/collections/${nft.data.nft?.collection}`,
        headers
      );

      openseaFees = collection.data.fees;
      isSuccess = true;
    })(),
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);

  return { openseaFees, isSuccess };
};
