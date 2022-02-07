import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as rootEndpoints from "@/api/endpoints/root";
import * as tokensEndpoints from "@/api/endpoints/tokens";

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
    path: "/admin/sync-arweave",
    options: adminEndpoints.postSyncArweaveOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-events",
    options: adminEndpoints.postSyncEventsOptions,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens",
    options: tokensEndpoints.getTokensOptions,
  });
};
