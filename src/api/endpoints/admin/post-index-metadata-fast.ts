import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { addToFastMetadataIndexQueue } from "@/jobs/fast-metadata-index";

export const postIndexMetadataFastOptions: RouteOptions = {
  description: "Trigger fast (re)indexing of metadata.",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      contract: Joi.string().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const contract = payload.contract;

      await addToFastMetadataIndexQueue(contract);

      return { message: "Success" };
    } catch (error) {
      logger.error(
        "post_index_metadata_fast_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
