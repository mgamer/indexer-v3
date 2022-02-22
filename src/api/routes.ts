import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transfersEndpoints from "@/api/endpoints/transfers";

export const setupRoutes = (server: Server) => {
  // Admin

  server.route({
    method: "POST",
    path: "/admin/fix-cache",
    options: adminEndpoints.postFixCacheOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-arweave",
    options: adminEndpoints.postSyncArweaveOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-events",
    options: adminEndpoints.postSyncEventsOptions,
  });

  // Collections

  server.route({
    method: "GET",
    path: "/collections/v1",
    options: collectionsEndpoints.getCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/v1",
    options: collectionsEndpoints.getCollectionV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/top-buys/v1",
    options: collectionsEndpoints.getCollectionTopBuysV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/collections/v1",
    options: collectionsEndpoints.getUserCollectionsV1Options,
  });

  // Orders

  server.route({
    method: "GET",
    path: "/orders/v1",
    options: ordersEndpoints.getOrdersV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/all/v1",
    options: ordersEndpoints.getOrdersAllV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/liquidity/v1",
    options: ordersEndpoints.getUsersLiquidityV1Options,
  });

  server.route({
    method: "POST",
    path: "/orders/v1",
    options: ordersEndpoints.postOrdersV1Options,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners/v1",
    options: ownersEndpoints.getOwnersV1Options,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens/v1",
    options: tokensEndpoints.getTokensV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/details/v1",
    options: tokensEndpoints.getTokensDetailsV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/floor/v1",
    options: tokensEndpoints.getTokensFloorV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v1",
    options: tokensEndpoints.getUserTokensV1Options,
  });

  // Transfers

  server.route({
    method: "GET",
    path: "/sales/v1",
    options: transfersEndpoints.getSalesV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v1",
    options: transfersEndpoints.getTransfersV1Options,
  });
};
