import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { getTransfers } from "@entities/transfer";

export const getTransfersOptions: RouteOptions = {
  description: "Get transfers information",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase().required(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    const contract = query.contract as string;
    const tokenId = query.tokenId as string | undefined;
    const offset = query.offset as number;
    const limit = query.limit as number;

    const transfers = await getTransfers({
      contract,
      tokenId,
      offset,
      limit,
    });

    return { transfers };
  },
};
