import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as rootEndpoints from "@/api/endpoints/root";

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
    path: "/admin/sync-events",
    options: adminEndpoints.postSyncEventsOptions,
  });
};
