import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { config } from "@/config/index";
import { logger } from "@/common/logger";

const version = "v1";

export const postExecuteMatchV1Options: RouteOptions = {
  description: "Indirectly fill an order via a relayer",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.object({
      order: Joi.any().required(),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postExecuteMatch${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-match-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const order = new Sdk.SeaportV15.Order(config.chainId, payload.order);

      switch (preSignature.kind) {
        case "payment-processor-take-order": {
          // Attach the signature to the pre-signature
          preSignature.signature = query.signature;

          const signatureValid = checkEIP721Signature(
            preSignature.data,
            query.signature,
            preSignature.signer
          );
          if (!signatureValid) {
            throw new Error("Invalid signature");
          }

          // Update the cached pre-signature to include the signature
          await savePreSignature(payload.id, preSignature, 0);

          break;
        }

        default: {
          throw new Error("Unknown pre-signature kind");
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-pre-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
