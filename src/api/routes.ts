import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as ordersEndpoints from "@/api/endpoints/orders";
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

  // Collections

  server.route({
    method: "GET",
    path: "/collections",
    options: collectionsEndpoints.getCollectionsOptions,
  });

  // Orders

  server.route({
    method: "POST",
    path: "/orders/wyvern-v2",
    options: ordersEndpoints.postWyvernV2OrdersOptions,
  });

  server.route({
    method: "GET",
    path: "/orders",
    options: ordersEndpoints.getOrdersOptions,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens",
    options: tokensEndpoints.getTokensOptions,
  });

  server.route({
    method: "GET",
    path: "/owners",
    options: tokensEndpoints.getTokenOwnersOptions,
  });

  server.route({
    method: "GET",
    path: "/stats",
    options: tokensEndpoints.getTokenStatsOptions,
  });

  // Transfers

  server.route({
    method: "GET",
    path: "/transfers",
    options: transfersEndpoints.getTransfersOptions,
  });
};
