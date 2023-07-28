export const extendCollection = async (_chainId: number, metadata: any, _tokenId = null) => {
  metadata.id = `${metadata.contract}:courtyard-${metadata.slug}`;
  metadata.tokenIdRange = null;
  metadata.tokenSetId = null;

  return { ...metadata };
};

export const extend = async (_chainId: number, metadata: any) => {
  metadata.collection = `${metadata.contract}:courtyard-${metadata.slug}`;
  return { ...metadata };
};
