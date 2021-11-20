import { Server } from "@hapi/hapi";

import * as adminEndpoints from "./endpoints/admin";
import * as rootEndpoints from "./endpoints/root";

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
    path: "/admin/contracts",
    options: adminEndpoints.postContractsOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync/events",
    options: adminEndpoints.postSyncEventsOptions,
  });
};
