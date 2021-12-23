import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";

export const pingOptions: RouteOptions = {
  description: "Ping",
  handler: async () => {
    return { message: "Success" };
  },
};
