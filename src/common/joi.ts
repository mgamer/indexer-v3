import Joi from "joi";

import { regex } from "@/common/utils";

export const JoiPrice = Joi.object({
  currency: Joi.object({
    contract: Joi.string().pattern(regex.address),
    name: Joi.string(),
    symbol: Joi.string(),
    decimals: Joi.number(),
  }),
  amount: Joi.object({
    raw: Joi.string().pattern(regex.number),
    decimal: Joi.number().unsafe(),
    usd: Joi.number().unsafe(),
    native: Joi.number().unsafe(),
  }),
});
