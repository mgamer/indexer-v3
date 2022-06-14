/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";
import { ActivityType } from "@/models/activities/activities-entity";
import { UserActivities } from "@/models/user_activities";

const version = "v1";

export const getUserActivityV1Options: RouteOptions = {
  description: "Get activity events for the given user",
  notes: "This API can be used to build a feed for a user",
  tags: ["api", "Activity"],
  plugins: {
    "hapi-swagger": {
      order: 1,
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
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: Joi.number(),
          amount: Joi.number(),
          timestamp: Joi.number(),
          token: Joi.object({
            tokenId: Joi.string().allow(null),
            tokenName: Joi.string().allow(null),
            tokenImage: Joi.string().allow(null),
          }),
          collection: Joi.object({
            collectionId: Joi.string().allow(null),
            collectionName: Joi.string().allow(null),
            collectionImage: Joi.string().allow(null),
          }),
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

    try {
      const activities = await UserActivities.getActivities(
        params.user,
        query.continuation,
        query.types,
        query.limit
      );

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      // Iterate over the activities
      const result = _.map(activities, (activity) => ({
        type: activity.type,
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        price: formatEth(activity.price),
        amount: activity.amount,
        timestamp: activity.eventTimestamp,
        token: activity.token,
        collection: activity.collection,
      }));

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          continuation = lastActivity.eventTimestamp;
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-user-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
