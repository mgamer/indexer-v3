import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/seaport/builders/base";

import { edb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  orderbook: "opensea" | "reservoir";
  quantity?: number;
  nonce?: string;
  fee?: number[];
  feeRecipient?: string[];
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
  automatedRoyalties?: boolean;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo | undefined> => {
  const collectionResult = await edb.oneOrNone(
    `
      SELECT
        contracts.kind,
        collections.royalties
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection.
    return undefined;
  }

  const exchange = new Sdk.Seaport.Exchange(config.chainId);

  const buildParams: BaseBuildParams = {
    offerer: options.maker,
    side,
    tokenKind: collectionResult.kind,
    contract: options.contract,
    price: options.weiPrice,
    paymentToken:
      side === "buy"
        ? Sdk.Common.Addresses.Weth[config.chainId]
        : Sdk.Common.Addresses.Eth[config.chainId],
    fees: [],
    // Use OpenSea's pausable zone when posting to OpenSea
    zone:
      options.orderbook === "opensea"
        ? Sdk.Seaport.Addresses.PausableZone[config.chainId]
        : AddressZero,
    // OpenSea's conduit for sharing approvals
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    startTime: options.listingTime,
    endTime: options.expirationTime,
    salt: options.salt,
    counter: (await exchange.getCounter(baseProvider, options.maker)).toString(),
  };

  // Keep track of the total amount of fees
  let totalFees = bn(0);

  if (options.automatedRoyalties) {
    // Include the royalties
    for (const { recipient, bps } of collectionResult.royalties || []) {
      if (recipient && Number(bps) > 0) {
        const fee = bn(bps).mul(options.weiPrice).div(10000).toString();
        buildParams.fees!.push({
          recipient,
          amount: fee,
        });

        totalFees = totalFees.add(fee);
      }
    }
  }

  if (options.fee && options.feeRecipient) {
    for (let i = 0; i < options.fee.length; i++) {
      const fee = bn(options.fee[i]).mul(options.weiPrice).div(10000).toString();
      buildParams.fees!.push({
        recipient: options.feeRecipient[i],
        amount: fee,
      });
      totalFees = totalFees.add(fee);
    }
  }

  // Subtract the fees from the gross price
  buildParams.price = bn(buildParams.price).sub(totalFees);

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};
