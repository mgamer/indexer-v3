import axios from "axios";
import * as cheerio from "cheerio";

import { redis } from "@/common/redis";

const SDN_LIST = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml";
const OFAC_BLACKLIST_KEY = "ofac_blacklist";

export const getSDNList = async () => {
  const { data } = await axios.get(SDN_LIST);

  const $ = cheerio.load(data, {
    xmlMode: true,
  });

  const featureTypes = $("FeatureTypeValues > FeatureType");
  const currencyTypes: {
    id: string;
    name: string;
    list: string[];
  }[] = [];

  for (let i = 0; i < featureTypes.length; i++) {
    const featureType = featureTypes.eq(i);

    const name = featureType.text();
    if (name.includes("Digital Currency Address")) {
      currencyTypes.push({
        id: featureType.attr("ID")!,
        name,
        list: [],
      });
    }
  }

  for (const currencyType of currencyTypes) {
    const features = $(`DistinctParties [FeatureTypeID="${currencyType.id}"]`);
    for (let i = 0; i < features.length; i++) {
      const feature = features.eq(i);

      const versionDetail = feature.find("VersionDetail");
      if (versionDetail) {
        currencyType.list.push(versionDetail.text().trim().toLowerCase());
      }
    }
  }

  return currencyTypes;
};

export const getETHSDNList = async (): Promise<string[]> => {
  const currencyTypes = await getSDNList();
  const ethData = currencyTypes.find((c) => c.name === "Digital Currency Address - ETH");
  return ethData ? ethData.list : [];
};

export const updateETHSDNList = async () => {
  const addressList = await getETHSDNList();
  await redis.set(OFAC_BLACKLIST_KEY, JSON.stringify(addressList));
  return addressList;
};

export const checkAddressIsBlockedByOFAC = async (address: string) => {
  const blacklistList = await redis
    .get(OFAC_BLACKLIST_KEY)
    .then((s) => (s ? (JSON.parse(s) as string[]) : []));
  return blacklistList.includes(address);
};
