// import { Interface } from "@ethersproject/abi";
// import { Contract } from "@ethersproject/contracts";
// import axios from "axios";

// import { idb, redb } from "@/common/db";
// import { baseProvider } from "@/common/provider";
// import { toBuffer } from "@/common/utils";
// import { getNetworkSettings } from "@/config/network";
// import { parseUnits } from "@ethersproject/units";

// type CurrencyMetadata = {
//   coingeckoCurrencyId?: string;
// };

// type Currency = {
//   contract: string;
//   name: string;
//   symbol: string;
//   decimals: number;
//   metadata: CurrencyMetadata;
// };

// export const getCurrency = async (currencyAddress: string): Promise<Currency> => {
//   const result = await redb.oneOrNone(
//     `
//       SELECT
//         currencies.name,
//         currencies.symbol,
//         currencies.decimals,
//         currencies.metadata
//       FROM currencies
//       WHERE currencies.contract = $/contract/
//     `,
//     {
//       contract: toBuffer(currencyAddress),
//     }
//   );

//   if (result) {
//     // If the currency is already stored in the table, then we just return it
//     return {
//       contract: currencyAddress,
//       name: result.name,
//       symbol: result.symbol,
//       decimals: result.decimals,
//       metadata: result.metadata,
//     };
//   } else {
//     // Otherwise we have to fetch its details

//     // `name`, `symbol` and `decimals` are fetched from on-chain
//     const iface = new Interface([
//       "function name() view returns (string)",
//       "function symbol() view returns (string)",
//       "function decimals() view returns (uint8)",
//     ]);

//     const contract = new Contract(currencyAddress, iface, baseProvider);
//     const name = await contract.name();
//     const symbol = await contract.symbol();
//     const decimals = await contract.decimals();
//     const metadata: CurrencyMetadata = {};

//     const networkSettings = getNetworkSettings();
//     const cg = networkSettings.coingecko;
//     if (cg) {
//       const result: { id?: string } = await axios
//         .get(`https://api.coingecko.com/api/v3/coins/${cg.networkId}/contract/${address}`)
//         .then((response) => response.data);
//       if (result.id) {
//         metadata.coingeckoCurrencyId = result.id;
//       }
//     }

//     await idb.none(
//       `
//         INSERT INTO currencies (
//           contract,
//           name,
//           symbol,
//           decimals,
//           metadata
//         ) VALUES (
//           $/contract/,
//           $/name/,
//           $/symbol/,
//           $/decimals/,
//           $/metadata:json/
//         ) ON CONFLICT DO NOTHING
//       `,
//       {
//         contract: toBuffer(currencyAddress),
//         name,
//         symbol,
//         decimals,
//         metadata,
//       }
//     );

//     return {
//       contract: currencyAddress,
//       name,
//       symbol,
//       decimals,
//       metadata,
//     };
//   }
// };

// type Price = {
//   currency: string;
//   timestamp: number;
//   value: string;
// };

// // Fetch the historical price of
// const getUpstreamUSDPrice = async (
//   currencyAddress: string,
//   timestamp: number
// ): Promise<Price | undefined> => {
//   // Fetch the currency's details
//   const currency = await getCurrency(currencyAddress);
//   const coingeckoCurrencyId = currency?.metadata?.coingeckoCurrencyId;

//   if (coingeckoCurrencyId) {
//     // Get the current day from the timestamp
//     const date = new Date(timestamp);
//     const day = date.getDay();
//     const month = date.getMonth() + 1;
//     const year = date.getFullYear();

//     // Fetch the USD price from CoinGecko
//     const result: {
//       market_data: {
//         current_price: { [symbol: string]: number };
//       };
//     } = await axios
//       .get(
//         `https://api.coingecko.com/api/v3/coins/${coingeckoCurrencyId}/history?date=${day}-${month}-${year}`
//       )
//       .then((response) => response.data);

//     const usdPrice = result?.market_data?.current_price?.["usd"];
//     if (usdPrice) {
//       // USD had 6 decimals
//       const value = parseUnits(usdPrice.toFixed(6), 6).toString();

//       // Cache the price in the database
//       await idb.none(
//         `
//           INSERT INTO usd_prices (
//             currency,
//             timestamp,
//             value
//           ) VALUES (
//             $/currency/,
//             date_trunc('day', to_timestamp($/timestamp/)),
//             $/value/
//           ) ON CONFLICT DO NOTHING
//         `,
//         {
//           currency: currencyAddress,
//           timestamp,
//           value,
//         }
//       );

//       return {
//         currency: currencyAddress,
//         timestamp,
//         value,
//       };
//     }
//   }

//   return undefined;
// };

// const getCachedPrice = async (
//   baseCurrency: string,
//   quoteCurrency: string,
//   date: "latest" | number
// ): Promise<Price | undefined> => {
//   const result = await redb.oneOrNone(
//     `
//       SELECT
//         extract('epoch' from prices.date) AS date,
//         prices.price
//       FROM prices
//       WHERE prices.base_currency = $/baseCurrency/
//         AND prices.quote_currency = $/quoteCurrency/
//       ${
//         date === "latest"
//           ? "ORDER BY prices.date DESC"
//           : "AND prices.date = date_trunc('day', to_timestamp($/date/))"
//       }
//       LIMIT 1
//     `,
//     {
//       baseCurrency: toBuffer(baseCurrency),
//       quoteCurrency: toBuffer(quoteCurrency),
//     }
//   );
//   if (!result) {
//     return undefined;
//   }

//   return {
//     date: result.date,
//     price: result.price,
//     baseCurrency,
//     quoteCurrency,
//   };
// };

// export const getNativeAndUSDCPrice = async (timestamp: number, currencyAddress: string) => {
//   const networkSettings = getNetworkSettings();
//   const cg = networkSettings.coingecko;
//   if (cg) {
//     const currency = await getCurrency(currencyAddress);
//     if (currency?.metadata?.coingeckoCurrencyId) {
//       // Get CURRENCY/USDC
//       let currencyUsdcPrice = await getCachedPrice(
//         currencyAddress,
//         cg.usdcCurrencyContract,
//         timestamp
//       );
//       if (!currencyUsdcPrice) {
//       }

//       // Get USDC/NATIVE
//       const usdcNativePrice = await getCachedPrice(
//         cg.usdcCurrencyContract,
//         cg.nativeCurrencyContract,
//         timestamp
//       );

//       // Get the USDC price
//       const usdcPrice = await getCachedPrice(cg.nativeCurrencyContract, cg.usdcCurrencyContract);
//     }
//   }

//   const cg = networkSettings.coingecko;
//   if (cg) {
//     await axios.get(
//       `https://api.coingecko.com/api/v3/coins/${cg.networkId}/history?date=29-07-2022`
//     );
//   }
// };
