import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

export const watchList = [
  Sdk.SeaportV15.Addresses.Exchange[config.chainId],
  Sdk.SeaportV14.Addresses.Exchange[config.chainId],
];
