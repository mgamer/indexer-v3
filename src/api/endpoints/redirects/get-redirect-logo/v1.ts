/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";

const version = "v1";

export const getRedirectLogoV1Options: RouteOptions = {
  description: "Redirect response to the given source logo",
  tags: ["api", "5. Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    query: Joi.object({
      source: Joi.string().required(),
    }),
  },
  handler: async (request: Request, response) => {
    const query = request.query as any;
    const sources = await Sources.getInstance();

    try {
      const source = await sources.getByName(query.source);
      return response.redirect(source.metadata.icon);
    } catch (error) {
      logger.error(`get-redirect-logo-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
