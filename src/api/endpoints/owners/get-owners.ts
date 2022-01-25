import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { ownershipFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/owners/get-owners";

export const getOwnersOptions: RouteOptions = {
  description:
    "Get a list of owners and their ownership info. Useful for exploring top owners in a collection or attribute.",
  tags: ["api", "owners"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      owner: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      attributes: Joi.object().unknown(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      owners: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          ownership: ownershipFormat,
        })
      ),
    }).label("getOwnersResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_owners_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const owners = await queries.getOwners(query as queries.GetOwnersFilter);

      return { owners };
    } catch (error) {
      logger.error("get_owners_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
