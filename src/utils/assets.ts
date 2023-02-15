import _ from "lodash";
import { config } from "@/config/index";
import { encrypt } from "@/common/utils";
import { MergeRefs, ReqRefDefaults } from "@hapi/hapi";

export class Assets {
  public static getLocalAssetsLink(assets: string | string[]) {
    if (_.isEmpty(assets) || assets == "") {
      return undefined;
    }

    const baseUrl = `https://api${config.chainId == 1 ? "" : "-goerli"}.reservoir.tools/assets/v1?`;

    if (_.isArray(assets)) {
      const assetsResult = [];
      for (const asset of _.filter(assets, (a) => !_.isNull(a))) {
        const queryParams = new URLSearchParams();
        queryParams.append("asset", encrypt(asset));
        assetsResult.push(`${baseUrl}${queryParams.toString()}`);
      }

      return assetsResult;
    } else {
      const queryParams = new URLSearchParams();
      queryParams.append("asset", encrypt(assets));

      return `${baseUrl}${queryParams.toString()}`;
    }
  }

  public static addImageParams(image: string, query: MergeRefs<ReqRefDefaults>["Query"]): string {
    for (const [key, value] of Object.entries(query)) {
      image.includes("?") ? (image += "&") : (image += "?");
      image += `${key}=${value}`;
    }
    return image;
  }
}
