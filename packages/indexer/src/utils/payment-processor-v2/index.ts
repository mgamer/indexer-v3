import { Interface, Result } from "@ethersproject/abi";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, ridb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer, bn } from "@/common/utils";
import { config } from "@/config/index";
import { Royalty, updateRoyaltySpec } from "@/utils/royalties";

export enum PaymentSettings {
  DefaultPaymentMethodWhitelist = 0,
  AllowAnyPaymentMethod = 1,
  CustomPaymentMethodWhitelist = 2,
  PricingConstraints = 3,
}

export type CollectionPaymentSettings = {
  paymentSettings: PaymentSettings;
  constrainedPricingPaymentMethod: string;
  royaltyBackfillNumerator: number;
  royaltyBountyNumerator: number;
  isRoyaltyBountyExclusive: boolean;
  blockTradesFromUntrustedChannels: boolean;
  pricingBounds?: PricingBounds;
  whitelistedPaymentMethods: string[];
};

export type PricingBounds = {
  floorPrice: string;
  ceilingPrice: string;
};

export const getDefaultPaymentMethods = async (): Promise<string[]> => {
  const cacheKey = "pp-v2-default-payment-methods";

  let result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string[]) : undefined));
  if (!result) {
    const exchange = new Contract(
      Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId],
      new Interface(["function getDefaultPaymentMethods() view returns (address[])"]),
      baseProvider
    );

    result = exchange.getDefaultPaymentMethods().then((c: Result) => c.map((d) => d.toLowerCase()));
    await redis.set(cacheKey, JSON.stringify(result), "EX", 7 * 24 * 3600);
  }

  return result!;
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
              bool blockTradesFromUntrustedChannels
            )
          )`,
        ]),
        baseProvider
      );

      const paymentSettings = await exchange.collectionPaymentSettings(contract);

      result = {
        paymentSettings: paymentSettings.paymentSettings,
        constrainedPricingPaymentMethod:
          paymentSettings.constrainedPricingPaymentMethod.toLowerCase(),
        royaltyBackfillNumerator: paymentSettings.royaltyBackfillNumerator,
        royaltyBountyNumerator: paymentSettings.royaltyBountyNumerator,
        isRoyaltyBountyExclusive: paymentSettings.isRoyaltyBountyExclusive,
        blockTradesFromUntrustedChannels: paymentSettings.blockTradesFromUntrustedChannels,
        whitelistedPaymentMethods:
          paymentSettings.paymentMethodWhitelistId === 0
            ? await getDefaultPaymentMethods()
            : await getWhitelistedPaymentMethods(paymentSettings.paymentMethodWhitelistId),
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

export const addTrustedChannel = async (tokenAddress: string, channel: string, signer: string) =>
  idb.none(
    `
      INSERT INTO payment_processor_v2_trusted_channels (
        contract,
        channel,
        signer
      ) VALUES (
        $/tokenAddress/,
        $/channel/,
        $/signer/
      ) ON CONFLICT DO NOTHING
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
      channel: toBuffer(channel),
      signer: toBuffer(signer),
    }
  );

export const removeTrustedChannel = async (tokenAddress: string, channel: string) =>
  idb.none(
    `
      DELETE FROM payment_processor_v2_trusted_channels
      WHERE payment_processor_v2_trusted_channels.contract = $/tokenAddress/
        AND payment_processor_v2_trusted_channels.channel = $/channel/
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
        payment_processor_v2_trusted_channels.channel,
        payment_processor_v2_trusted_channels.signer
      FROM payment_processor_v2_trusted_channels
      WHERE payment_processor_v2_trusted_channels.contract = $/tokenAddress/
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
    }
  );

  return results.map((c) => ({
    channel: fromBuffer(c.channel),
    signer: fromBuffer(c.signer),
  }));
};

export const saveBackfilledRoyalties = async (tokenAddress: string, royalties: Royalty[]) =>
  updateRoyaltySpec(
    tokenAddress,
    "pp-v2-backfill",
    royalties.some((r) => r.recipient !== AddressZero) ? royalties : undefined
  );

export const addPaymentMethodToWhitelist = async (id: number, paymentMethod: string) =>
  idb.none(
    `
      INSERT INTO payment_processor_v2_payment_methods (
        id,
        payment_method
      ) VALUES (
        $/id/,
        $/paymentMethod/
      ) ON CONFLICT DO NOTHING
    `,
    {
      id,
      paymentMethod: toBuffer(paymentMethod),
    }
  );

export const removePaymentMethodFromWhitelist = async (id: number, paymentMethod: string) =>
  idb.none(
    `
      DELETE FROM payment_processor_v2_payment_methods
      WHERE payment_processor_v2_payment_methods.id = $/id/
        AND payment_processor_v2_payment_methods.payment_method = $/paymentMethod/
    `,
    {
      id,
      paymentMethod: toBuffer(paymentMethod),
    }
  );

export const getWhitelistedPaymentMethods = async (id: number) => {
  const results = await ridb.manyOrNone(
    `
      SELECT
        payment_processor_v2_payment_methods.payment_method
      FROM payment_processor_v2_payment_methods
      WHERE payment_processor_v2_payment_methods.id = $/paymentMethodWhitelistId/
    `,
    {
      id,
    }
  );

  return results.map((c) => fromBuffer(c.payment_method));
};

export const getMarketplaceIdFromDb = async (marketplace: string) =>
  idb.oneOrNone(
    `
    SELECT
        payment_processor_v2_marketplaces.id
      FROM payment_processor_v2_marketplaces
      WHERE payment_processor_v2_marketplaces.marketplace = $/marketplace/ 
    `,
    {
      marketplace: toBuffer(marketplace),
    }
  );

export const getMarketplaceId = async (marketplace: string) => {
  const result = await getMarketplaceIdFromDb(marketplace);
  if (!result) {
    await idb.none(
      `
        INSERT INTO payment_processor_v2_marketplaces (
          marketplace
        ) VALUES (
          $/marketplace/
        ) ON CONFLICT DO NOTHING
      `,
      {
        marketplace: toBuffer(marketplace),
      }
    );
  }
  return (await getMarketplaceIdFromDb(marketplace)).id;
};

export const getUserNonce = async (marketplace: string, user: string) => {
  const result = await idb.oneOrNone(
    `
      SELECT payment_processor_v2_nonces.nonce 
      FROM payment_processor_v2_nonces
      WHERE payment_processor_v2_nonces.marketplace = $/marketplace/
      AND payment_processor_v2_nonces.maker = $/user/
    `,
    {
      marketplace: toBuffer(marketplace),
      user: toBuffer(user),
    }
  );

  return result ? result.nonce : 0;
};

export const increaseUserNonce = async (marketplace: string, user: string, nonce: string) => {
  const userNonce = await redis.get(`payment-processor-v2-nonce:${nonce}`);
  if (!userNonce) {
    // not exists
    return;
  }
  await idb.none(
    `
      INSERT INTO payment_processor_v2_nonces (
        marketplace,
        maker,
        nonce
      ) VALUES (
        $/marketplace/,
        $/maker/,
        $/nonce/
      )
      ON CONFLICT (marketplace, maker)
      DO UPDATE SET nonce = $/nonce/;
    `,
    {
      marketplace: toBuffer(marketplace),
      maker: toBuffer(user),
      nonce: bn(userNonce).add(1).toString(),
    }
  );
};

export function generateNextUserNonce(marketplaceId: BigNumberish, userNonce: BigNumberish) {
  // Shift the marketplaceId left by 224 bits
  const shiftedMarketplaceId = bn(marketplaceId).shl(224);

  // Increment the user nonce by 1
  const incrementedNonce = bn(userNonce).add(1);

  // Ensure the nonce only occupies the lower 224 bits
  const upperBound = BigNumber.from(2).pow(224).sub(1);
  if (incrementedNonce.gt(upperBound)) {
    throw new Error("Congratulations - you are the trading king!");
  }

  // Combine the shifted marketplace ID and the masked nonce
  return shiftedMarketplaceId.add(incrementedNonce).toString();
}

export const getNextUserNonce = async (marketplace: string, user: string) => {
  const [userNonce, marketplaceId] = await Promise.all([
    getUserNonce(marketplace, user),
    getMarketplaceId(marketplace),
  ]);
  const nonce = await generateNextUserNonce(marketplaceId, userNonce);
  await redis.set(`payment-processor-v2-nonce:${nonce}`, userNonce, "EX", 7 * 24 * 3600);
  return {
    nonce,
    userNonce,
    marketplaceId,
  };
};
