import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { getTransfers } from "../../entities/transfer";

export const getTransfersOptions: RouteOptions = {
  description: "Get transfers information",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase().required(),
      tokenId: Joi.string(),
      offset: Joi.number().integer().positive().min(0).default(0).required(),
      limit: Joi.number()
        .integer()
        .positive()
        .min(0)
        .max(20)
        .default(20)
        .required(),
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
