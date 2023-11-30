import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { AddressZero } from "@ethersproject/constants";

import { idb, ridb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum PaymentSettings {
  DefaultPaymentMethodWhitelist = 0,
  AllowAnyPaymentMethod = 1,
  CustomPaymentMethodWhitelist = 2,
  PricingConstraints = 3,
}

export type CollectionPaymentSettings = {
  paymentSettings: PaymentSettings;
  paymentMethodWhitelistId: number;
  constrainedPricingPaymentMethod: string;
  royaltyBackfillNumerator: number;
  royaltyBountyNumerator: number;
  isRoyaltyBountyExclusive: boolean;
  blockTradesFromUntrustedChannels: boolean;
  pricingBounds?: PricingBounds;
};

export type PricingBounds = {
  floorPrice: string;
  ceilingPrice: string;
};

export const getCollectionPaymentSettings = async (
  contract: string,
  refresh?: boolean
): Promise<CollectionPaymentSettings | undefined> => {
  const cacheKey = `payment-processor-v2-payment-settings-by-contract:${contract}`;

  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as CollectionPaymentSettings) : undefined));
  if (!result || refresh) {
    try {
      const exchange = new Contract(
        Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId],
        new Interface([
          `function collectionPaymentSettings(address token) view returns (
            (
              uint8 paymentSettings,
              uint32 paymentMethodWhitelistId,
              address constrainedPricingPaymentMethod,
              uint16 royaltyBackfillNumerator,
              uint16 royaltyBountyNumerator,
              bool isRoyaltyBountyExclusive,
              bool blockTradesFromUntrustedChannels,
            )
          )`,
        ]),
        baseProvider
      );

      const paymentSettings = await exchange.collectionPaymentSettings(contract);
      result = {
        paymentSettings: paymentSettings.paymentSettings,
        paymentMethodWhitelistId: paymentSettings.paymentMethodWhitelistId,
        constrainedPricingPaymentMethod: paymentSettings.constrainedPricingPaymentMethod,
        royaltyBackfillNumerator: paymentSettings.royaltyBackfillNumerator,
        royaltyBountyNumerator: paymentSettings.royaltyBountyNumerator,
        isRoyaltyBountyExclusive: paymentSettings.isRoyaltyBountyExclusive,
        blockTradesFromUntrustedChannels: paymentSettings.blockTradesFromUntrustedChannels,
      };

      if (result?.paymentSettings === PaymentSettings.PricingConstraints) {
        const pricingBounds = {
          floorPrice: await exchange
            .getFloorPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
          ceilingPrice: await exchange
            .getCeilingPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
        };
        result.pricingBounds = pricingBounds;
      }

      if (result) {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
      }
    } catch {
      // Skip errors
    }
  }

  return result;
};

export const addTrustedChannel = async (tokenAddress: string, channel: string) =>
  idb.none(
    `
      INSERT INTO trusted_channels(
        contract,
        channel
      ) VALUES (
        $/tokenAddress/,
        $/channel/
      ) ON CONFLICT DO NOTHING
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
      channel: toBuffer(channel),
    }
  );

export const removeTrustedChannel = async (tokenAddress: string, channel: string) =>
  idb.none(
    `
      DELETE FROM trusted_channels
      WHERE contract = $/tokenAddress/
      AND channel = $/channel/
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
      channel: toBuffer(channel),
    }
  );

export const getAllTrustedChannels = async (tokenAddress: string) => {
  const results = await ridb.manyOrNone(
    `
        SELECT
          channel
        FROM trusted_channels
        WHERE contract = $/tokenAddress/
      `,
    {
      tokenAddress: toBuffer(tokenAddress),
    }
  );
  return results.map((c) => fromBuffer(c.channel));
};

export async function isTrustedChannelWithoutSigner(channel: string, refresh?: boolean) {
  const cacheKey = `payment-processor-v2-trusted-channel:${channel}`;
  let result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string) : undefined));
  if (!result || refresh) {
    try {
      const exchange = new Contract(
        channel,
        new Interface([`function signer(address token) view returns (address)`]),
        baseProvider
      );
      result = await exchange.callStatic.signer();
      if (result) {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 60 * 10);
      }
    } catch {
      // Skip errors
    }
  }
  return result && result === AddressZero;
}

export async function getTrustedChannels(tokenAddress: string) {
  const channels = await getAllTrustedChannels(tokenAddress);
  const channelStatus = await Promise.all(channels.map((c) => isTrustedChannelWithoutSigner(c)));
  const emptyChannels: string[] = [];
  channelStatus.forEach((status, index) => {
    if (status) emptyChannels.push(channels[index]);
  });
  return emptyChannels;
}
