/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import JoiBase from "joi";
import JoiDate from "@joi/date";
import _ from "lodash";
import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { sub } from "date-fns";

const Joi = JoiBase.extend(JoiDate);

export const getApiKeyMetrics: RouteOptions = {
  description: "Get API usage metrics for the given API key",
  notes: "Get API usage metrics for the given API key",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
      orders: 13,
    },
  },
  validate: {
    params: Joi.object({
      key: Joi.string().uuid().description("The API key"),
    }),
    query: Joi.object({
      period: Joi.string()
        .valid("hourly", "daily", "monthly")
        .default("monthly")
        .description(
          "Return results grouped by either hourly/daily/monthly. hourly will return time in format YYYY-MM-DDTHH:00:00, daily will return time in format YYYY-MM-DDT00:00:00, monthly will return time in format YYYY-MM-01T00:00:00"
        ),
      breakByStatusCode: Joi.boolean()
        .default(false)
        .description("If true will return results broken by returned HTTP code"),
      startTime: Joi.date()
        .format("YYYY-MM-DD HH:00")
        .description(
          "Get metrics after a particular time (allowed format YYYY-MM-DD HH:00). hourly default to last 24 hours, daily default to last 7 days, monthly default to last 12 months"
        ),
      endTime: Joi.date()
        .format("YYYY-MM-DD HH:00")
        .description("Get metrics before a particular time (allowed format YYYY-MM-DD HH:00)"),
    }),
  },
  response: {
    schema: Joi.object({
      metrics: Joi.array().items(
        Joi.object({
          route: Joi.string(),
          apiCallsCount: Joi.number(),
          statusCode: Joi.number().optional(),
          time: Joi.string(),
        })
      ),
    }).label("getApiKeyMetricsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get-api-key-metrics-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    let tableName = "monthly_api_usage";
    let timeColumnName = "month";

    switch (query.period) {
      case "hourly":
        tableName = "hourly_api_usage";
        timeColumnName = "hour";
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              hours: 24,
            }).toISOString();
        break;

      case "daily":
        tableName = "daily_api_usage";
        timeColumnName = "day";
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              days: 7,
            }).toISOString();
        break;

      case "monthly":
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              months: 12,
            }).toISOString();
        break;
    }

    const baseQuery = `
      SELECT ${timeColumnName}, route, SUM(api_calls_count) AS "api_calls_count" ${
      query.breakByStatusCode ? ", status_code" : ""
    }
      FROM ${tableName}
      WHERE api_key = $/key/
      ${query.startTime ? `AND ${timeColumnName} >= $/startTime/` : ``}
      ${query.endTime ? `AND ${timeColumnName} <= $/endTime/` : ``}
      ${
        query.breakByStatusCode
          ? `GROUP BY ${timeColumnName}, route, status_code`
          : `GROUP BY ${timeColumnName}, route`
      }
      ORDER BY ${timeColumnName} ASC
    `;

    try {
      const metrics = await redb.manyOrNone(baseQuery, _.merge(params, query));

      return {
        metrics: _.map(metrics, (metric) => ({
          route: metric.route,
          apiCallsCount: _.toNumber(metric.api_calls_count),
          statusCode: query.breakByStatusCode ? metric.status_code : undefined,
          time: metric[timeColumnName].toISOString(),
        })),
      };
    } catch (error) {
      logger.error("get-api-key-metrics-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
