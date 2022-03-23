/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "../config";
import axios from "axios";

import { network } from "@/common/provider";

export class MetadataApi {
  static async getCollectionMetadata(contract: string, tokenId: string) {
    const url = `${config.metadataApiBaseUrl}/v3/${network}/collection?contract=${contract}&tokenId=${tokenId}`;

    const { data } = await axios.get(url);

    const collection: {
      id: string;
      slug: string;
      name: string;
      community: string | null;
      metadata: object | null;
      royalties: object | null;
      contract: string;
      tokenIdRange: [string, string] | null;
      tokenSetId: string;
    } = (data as any).collection;

    return collection;
  }
}

export { MetadataApi as default };
