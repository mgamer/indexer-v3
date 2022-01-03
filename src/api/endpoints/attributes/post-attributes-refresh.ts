import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";

export const postAttributesRefreshOptions: RouteOptions = {
  description: "Trigger attributes refresh",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      await db.none(
        `
          update "tokens" set "metadata_indexed" = false
          where "contract" = $/contract/ and "token_id" = $/tokenId/
        `,
        {
          contract: query.contract,
          tokenId: query.tokenId,
        }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error(
        "post_attributes_refresh_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
