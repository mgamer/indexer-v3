import { RouteOptions } from "@hapi/hapi";

export const getMarketplaces: RouteOptions = {
  description: "Get supported marketplaces",
  tags: ["api", "x-admin"],
  timeout: {
    server: 10 * 1000,
  },
  handler: async () => {
    return {
      marketplaces: [
        {
          name: "Reservoir",
          imgUrl: "https://api.reservoir.tools/redirect/sources/reservoir/logo/v2",
          feeBps: 0,
          orderbook: "reservoir",
          orderKind: "seaport",
          listingEnabled: true,
        },
        {
          name: "OpenSea",
          imageUrl: "https://api.reservoir.tools/redirect/sources/opensea/logo/v2",
          feeBps: 0.025,
          orderbook: "opensea",
          orderKind: "seaport",
          listingEnabled: true,
        },
        {
          name: "LooksRare",
          imageUrl: "https://api.reservoir.tools/redirect/sources/looksrare/logo/v2",
          feeBps: 0.02,
          orderbook: "looks-rare",
          orderKind: "looks-rare",
          listingEnabled: true,
        },
        {
          name: "x2y2",
          imageUrl: "https://api.reservoir.tools/redirect/sources/x2y2/logo/v2",
          feeBps: 0.05,
          orderBook: null,
          orderKind: null,
          listingEnabled: false,
        },
        {
          name: "Foundation",
          imageUrl: "https://api.reservoir.tools/redirect/sources/foundation/logo/v2",
          feeBps: 0.05,
          orderBook: null,
          orderKind: null,
          listingEnabled: false,
        },
      ],
    };
  },
};
