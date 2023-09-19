import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";

export type PaymentProcessorConfig = {
  paymentCoin: string;
  securityPolicyId: number;
  policy?: SecurityPolicy;
};

export type SecurityPolicy = {
  enforceExchangeWhitelist: boolean;
  enforcePaymentMethodWhitelist: boolean;
  enforcePricingConstraints: boolean;
  disablePrivateListings: boolean;
  disableDelegatedPurchases: boolean;
  disableEIP1271Signatures: boolean;
  disableExchangeWhitelistEOABypass: boolean;
  pushPaymentGasLimit: string;
};

export const getSecurityPolicy = async (
  securityPolicyId: string,
  refresh?: boolean
): Promise<SecurityPolicy | undefined> => {
  const cacheKey = `payment-processor-security-policy-id:${securityPolicyId}`;
  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as SecurityPolicy) : undefined));
  if (result == undefined || refresh) {
    try {
      const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId).contract.connect(
        baseProvider
      );
      const securityPolicy = await exchange.getSecurityPolicy(securityPolicyId);
      result = {
        enforceExchangeWhitelist: securityPolicy.enforceExchangeWhitelist,
        enforcePaymentMethodWhitelist: securityPolicy.enforcePaymentMethodWhitelist,
        enforcePricingConstraints: securityPolicy.enforcePricingConstraints,
        disablePrivateListings: securityPolicy.disablePrivateListings,
        disableDelegatedPurchases: securityPolicy.disableDelegatedPurchases,
        disableEIP1271Signatures: securityPolicy.disableEIP1271Signatures,
        disableExchangeWhitelistEOABypass: securityPolicy.disableExchangeWhitelistEOABypass,
        pushPaymentGasLimit: securityPolicy.pushPaymentGasLimit,
      };
      await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
    } catch {
      // Skip errors
    }
  }

  return result;
};

export const getContractSecurityPolicy = async (
  contract: string,
  refresh?: boolean
): Promise<PaymentProcessorConfig | undefined> => {
  const cacheKey = `payment-processor-security-policy:${contract}`;
  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as PaymentProcessorConfig) : undefined));
  if (result == undefined || refresh) {
    try {
      const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId).contract.connect(
        baseProvider
      );
      const securityPolicyId = await exchange.getTokenSecurityPolicyId(contract);
      const paymentCoin = await exchange.collectionPaymentCoins(contract);
      result = {
        paymentCoin,
        securityPolicyId: securityPolicyId.toString(),
        policy: await getSecurityPolicy(securityPolicyId, refresh),
      };
      await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
    } catch {
      // Skip errors
    }
  }
  return result;
};
