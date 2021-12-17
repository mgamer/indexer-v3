import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as attributesEndpoints from "@/api/endpoints/attributes";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as rootEndpoints from "@/api/endpoints/root";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transfersEndpoints from "@/api/endpoints/transfers";

export const setupRoutes = (server: Server) => {
  // Root

  server.route({
    method: "GET",
    path: "/",
    options: rootEndpoints.pingOptions,
  });

  // Admin

  server.route({
    method: "POST",
    path: "/admin/sync/events",
    options: adminEndpoints.postSyncEventsOptions,
  });

  // Attributes

  server.route({
    method: "GET",
    path: "/attributes",
    options: attributesEndpoints.getAttributesOptions,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/explore",
    options: attributesEndpoints.getCollectionExploreOptions,
  });

  // Collections

  server.route({
    method: "GET",
    path: "/collections",
    options: collectionsEndpoints.getCollectionsOptions,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/collections",
    options: collectionsEndpoints.getUserCollectionsOptions,
  });

  // Orders

  server.route({
    method: "POST",
    path: "/orders",
    options: ordersEndpoints.postOrdersOptions,
  });

  server.route({
    method: "GET",
    path: "/orders",
    options: ordersEndpoints.getOrdersOptions,
  });

  server.route({
    method: "GET",
    path: "/orders/fill",
    options: ordersEndpoints.getFillOptions,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners",
    options: ownersEndpoints.getOwnersOptions,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens",
    options: tokensEndpoints.getTokensOptions,
  });

  server.route({
    method: "GET",
    path: "/tokens/stats",
    options: tokensEndpoints.getTokensStatsOptions,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens",
    options: tokensEndpoints.getUserTokensOptions,
  });

  // Transfers

  server.route({
    method: "GET",
    path: "/transfers",
    options: transfersEndpoints.getTransfersOptions,
  });
};
