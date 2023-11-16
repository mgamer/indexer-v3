/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

export const extend = async (metadata: any) => {
  const response = await axios.get(
    `https://api.zed.run/api/v1/horses/metadata/${metadata.tokenId}`
  );
  const attributes = response.data.attributes.map((a: { trait_type: string; value: string }) => ({
    key: a.trait_type,
    value: a.value,
    kind: typeof a.value,
    rank: 1,
  }));

  return { ...metadata, attributes };
};
