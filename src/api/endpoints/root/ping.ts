import { RouteOptions } from "@hapi/hapi";

export const pingOptions: RouteOptions = {
  description: "Ping",
  handler: () => {
    return { message: "Success" };
  },
};
