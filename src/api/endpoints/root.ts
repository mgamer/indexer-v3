import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";

export const pingOptions: RouteOptions = {
  description: "Ping",
  validate: {
    query: Joi.object({
      foo: Joi.string().required(),
    }),
  },
  handler: async () => {
    return { message: "Success" };
  },
};
