import axios from "axios";
import * as cheerio from "cheerio";

const SDN_LIST = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml";

export async function getSDNList() {
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

  for (let index = 0; index < featureTypes.length; index++) {
    const featureType = featureTypes.eq(index);
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
    for (let index = 0; index < features.length; index++) {
      const feature = features.eq(index);
      const versionDetail = feature.find("VersionDetail");
      if (versionDetail) {
        currencyType.list.push(versionDetail.text().trim().toLowerCase());
      }
    }
  }
  //   const ethData = currencyTypes.find((c) => c.name === "Digital Currency Address - ETH");
  //   console.log("currencyTypes", currencyTypes);
  return currencyTypes;
}
