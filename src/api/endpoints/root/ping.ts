import { RouteOptions } from "@hapi/hapi";

export const pingOptions: RouteOptions = {
  description: "Ping",
  handler: async () => {
    return { message: "Success" };
  },
};
