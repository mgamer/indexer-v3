import Joi from "joi";

import { formatEth, formatPrice, formatUsd, regex } from "@/common/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import { Currency, getCurrency } from "@/utils/currencies";

// --- Prices ---

const JoiPriceAmount = Joi.object({
  raw: Joi.string().pattern(regex.number),
  decimal: Joi.number().unsafe(),
  usd: Joi.number().unsafe().allow(null),
  native: Joi.number().unsafe(),
});

const JoiPriceCurrency = Joi.object({
  contract: Joi.string().pattern(regex.address),
  name: Joi.string(),
  symbol: Joi.string(),
  decimals: Joi.number(),
});

export const JoiPrice = Joi.object({
  currency: JoiPriceCurrency,
  amount: JoiPriceAmount,
  netAmount: JoiPriceAmount,
});

export const getJoiAmountObject = async (
  amount: string,
  nativeAmount: string,
  currency: Currency
) => {
  let usdPrice: string | undefined;
  if (amount) {
    usdPrice = (
      await getUSDAndNativePrices(currency.contract, amount, Math.floor(Date.now() / 1000), {
        onlyUSD: true,
      })
    ).usdPrice;
  }

  return {
    raw: amount,
    decimal: formatPrice(amount, currency.decimals),
    usd: usdPrice ? formatUsd(usdPrice) : null,
    native: formatEth(nativeAmount),
  };
};

export const getJoiPriceObject = async (
  prices: {
    gross: {
      amount: string;
      nativeAmount: string;
    };
    net: {
      amount: string;
      nativeAmount: string;
    };
  },
  currencyAddress: string
) => {
  const currency = await getCurrency(currencyAddress);
  return {
    currency: {
      contract: currency.contract,
      name: currency.name,
      symbol: currency.symbol,
      decimals: currency.decimals,
    },
    amount: await getJoiAmountObject(prices.gross.amount, prices.gross.nativeAmount, currency),
    netAmount: await getJoiAmountObject(prices.net.amount, prices.net.nativeAmount, currency),
  };
};
