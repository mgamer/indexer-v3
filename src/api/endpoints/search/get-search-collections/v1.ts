/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { edb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

const version = "v1";

export const getSearchCollectionsV1Options: RouteOptions = {
  description: "Search for collections by given name",
  tags: ["api", "6. Search"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    query: Joi.object({
      name: Joi.string()
        .lowercase()
        .description("Search for collections that match a string, e.g. `bored`"),
      limit: Joi.number().integer().min(1).max(50).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collectionId: Joi.string(),
          contract: Joi.string(),
          image: Joi.string().allow(null, ""),
          name: Joi.string(),
        })
      ),
    }).label(`getSearchCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-search-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    query.name = `%${query.name}%`;

    const baseQuery = `
            SELECT id, name, contract, (metadata ->> 'imageUrl')::TEXT AS image
            FROM collections
            WHERE name ILIKE $/name/
            ORDER BY collections.all_time_volume DESC NULLS LAST
            OFFSET 0
            LIMIT $/limit/`;

    const collections = await edb.manyOrNone(baseQuery, query);

    return {
      collections: _.map(collections, (collection) => ({
        collectionId: collection.id,
        name: collection.name,
        contract: fromBuffer(collection.contract),
        image: collection.image,
      })),
    };
  },
};
