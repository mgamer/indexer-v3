/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";
import { Activities } from "@/models/activities";
import { formatISO9075 } from "date-fns";
import { ActivityType } from "@/models/activities/activities-entity";

const version = "v1";

export const getUserActivityV1Options: RouteOptions = {
  description: "Get activity events for the given user",
  notes: "This API can be used to build a feed for a user",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 17,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Filter to a particular user, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(20).default(20),
      continuation: Joi.number(),
      types: Joi.array().items(
        Joi.string()
          .lowercase()
          .valid(..._.values(ActivityType))
      ),
    }),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.number().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string(),
          tokenId: Joi.string(),
          fromAddress: Joi.string(),
          toAddress: Joi.string(),
          price: Joi.number(),
          amount: Joi.number(),
          time: Joi.number(),
        })
      ),
    }).label(`getUserActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;
    let createdBefore = null;

    try {
      if (query.continuation) {
        createdBefore = formatISO9075(query.continuation);
      }

      const activities = await Activities.getUserActivities(
        params.user,
        createdBefore,
        query.types
      );

      // If no activities found
      if (_.isNull(activities)) {
        return { activities: [] };
      }

      // Iterate over the activities
      const result = _.map(activities, (activity) => ({
        type: activity.type,
        tokenId: activity.tokenId,
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        price: formatEth(activity.price),
        amount: activity.amount,
        time: activity.createdAt.getTime(),
      }));

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          continuation = lastActivity.createdAt.getTime();
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-user-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
