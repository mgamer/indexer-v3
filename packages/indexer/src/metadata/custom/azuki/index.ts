/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import axios from "axios";
import cbor from "cbor";
import { config } from "@/config/index";

export const fetchSatInformation = async (satUri: string) => {
  const splitUri = _.split(satUri, ":");
  if (splitUri.length) {
    const tokenId = splitUri[splitUri.length - 1];
    const satNumber = splitUri[splitUri.length - 2];
    const satUrl = `${config.ordinalsMetadataUrl}/r/sat/${satNumber}/at/${tokenId}`;
    const satResponse = await axios.get(satUrl);

    if (satResponse?.data?.id) {
      const metadataUrl = `${config.ordinalsMetadataUrl}/r/metadata/${satResponse.data.id}`;
      const metadataResponse = await axios.get(metadataUrl);

      if (metadataResponse?.data) {
        return { inscriptionId: satResponse.data.id, data: cbor.decode(metadataResponse.data) };
      }
    }
  }

  return {};
};

export const fetchTokenUriMetadata = async (
  { contract, tokenId }: { contract: string; tokenId: string },
  uri: string
) => {
  const info = await fetchSatInformation(uri);
  if (_.isEmpty(info)) {
    return {};
  }

  let image = `${config.ordinalsMetadataUrl}/content/${info?.inscriptionId}`;
  if (info?.data?.image && info.data.image !== uri) {
    const imageInfo = await fetchSatInformation(info.data.image);
    image = `${config.ordinalsMetadataUrl}/content/${imageInfo?.inscriptionId}`;
  }

  return {
    contract,
    tokenId,
    collection: contract,
    name: info?.data.name,
    description: info?.data.description,
    imageUrl: image,
    imageOriginalUrl: image,
    metadataOriginalUrl: uri,
    attributes: info?.data.attributes.map((attribute: any) => {
      return {
        key: attribute.trait_type,
        value: attribute.value,
        kind: "string",
        rank: 1,
      };
    }),
  };
};
