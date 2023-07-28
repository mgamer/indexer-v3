export const extendCollection = async (_chainId: number, metadata: any, _tokenId = null) => {
  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      imageUrl: "https://i.ibb.co/hy6vSS2/gmoney-collection.png",
    },
  };
};
