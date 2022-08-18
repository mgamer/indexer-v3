import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import * as currenciesQueue from "@/jobs/currencies/index";

type CurrencyMetadata = {
  coingeckoCurrencyId?: string;
};

export type Currency = {
  contract: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  metadata?: CurrencyMetadata;
};

export const getCurrency = async (currencyAddress: string): Promise<Currency> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        currencies.name,
        currencies.symbol,
        currencies.decimals,
        currencies.metadata
      FROM currencies
      WHERE currencies.contract = $/contract/
    `,
    {
      contract: toBuffer(currencyAddress),
    }
  );

  if (result) {
    return {
      contract: currencyAddress,
      name: result.name,
      symbol: result.symbol,
      decimals: result.decimals,
      metadata: result.metadata,
    };
  } else {
    let name: string | undefined;
    let symbol: string | undefined;
    let decimals: number | undefined;
    let metadata: CurrencyMetadata = {};

    // If the currency is not available, then we try to retrieve its details
    try {
      ({ name, symbol, decimals, metadata } = await tryGetCurrencyDetails(currencyAddress));
    } catch (error) {
      logger.error(
        "currencies",
        `Failed to initially fetch ${currencyAddress} currency details: ${error}`
      );

      // Retry fetching the currency details
      await currenciesQueue.addToQueue({ currency: currencyAddress });
    }

    await idb.none(
      `
        INSERT INTO currencies (
          contract,
          name,
          symbol,
          decimals,
          metadata
        ) VALUES (
          $/contract/,
          $/name/,
          $/symbol/,
          $/decimals/,
          $/metadata:json/
        ) ON CONFLICT DO NOTHING
      `,
      {
        contract: toBuffer(currencyAddress),
        name,
        symbol,
        decimals,
        metadata,
      }
    );

    return {
      contract: currencyAddress,
      name,
      symbol,
      decimals,
      metadata,
    };
  }
};

export const tryGetCurrencyDetails = async (currencyAddress: string) => {
  // `name`, `symbol` and `decimals` are fetched from on-chain
  const iface = new Interface([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ]);

  const contract = new Contract(currencyAddress, iface, baseProvider);
  const name = await contract.name();
  const symbol = await contract.symbol();
  const decimals = await contract.decimals();
  const metadata: CurrencyMetadata = {};

  const coingeckoNetworkId = getNetworkSettings().coingecko?.networkId;
  if (coingeckoNetworkId) {
    const result: { id?: string } = await axios
      .get(
        `https://api.coingecko.com/api/v3/coins/${coingeckoNetworkId}/contract/${currencyAddress}`,
        { timeout: 10 * 1000 }
      )
      .then((response) => response.data);
    if (result.id) {
      metadata.coingeckoCurrencyId = result.id;
    }
  }

  return {
    name,
    symbol,
    decimals,
    metadata,
  };
};
