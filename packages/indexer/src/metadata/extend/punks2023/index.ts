import axios from "axios";
import { TokenMetadata } from "@/metadata/types";

const metadataBaseURI = "https://punks2023.com/api/marketplace";

export const extend = async (metadata: TokenMetadata) => {
  const response = await axios.get(`${metadataBaseURI}/${metadata.tokenId}`);

  const { attributes: customAttributes } = response.data;
  const attributes = (customAttributes || []).map(
    (a: { trait_type: string; value: string; display_type: "string" }) => ({
      key: a.trait_type,
      value: a.value,
      kind: "string",
    })
  );
  return {
    ...metadata,
    attributes,
  };
};
