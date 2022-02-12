import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as tokensEndpoints from "@/api/endpoints/tokens";

export const setupRoutes = (server: Server) => {
  // Admin

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
};
