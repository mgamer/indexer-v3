import Joi from "joi";

// Common Joi validation entities

export const tokenFormat = Joi.object({
  contract: Joi.string(),
  kind: Joi.string(),
  name: Joi.string().allow("", null),
  image: Joi.string().allow(""),
  tokenId: Joi.string(),
  collection: Joi.object({
    id: Joi.string(),
    name: Joi.string(),
  }),
});

export const marketFormat = Joi.object({
  floorSell: {
    hash: Joi.string().allow(null),
    value: Joi.number().unsafe().allow(null),
    maker: Joi.string().allow(null),
    validFrom: Joi.number().allow(null),
  },
  topBuy: Joi.object({
    hash: Joi.string().allow(null),
    value: Joi.number().unsafe().allow(null),
    maker: Joi.string().allow(null),
    validFrom: Joi.number().allow(null),
  }),
});

export const setFormat = Joi.object({
  tokenCount: Joi.number(),
  onSaleCount: Joi.number(),
  sampleImages: Joi.array().items(Joi.string().allow("")),
  market: marketFormat,
});

export const ownershipFormat = Joi.object({
  tokenCount: Joi.number(),
  onSaleCount: Joi.number(),
  floorSellValue: Joi.number().unsafe().allow(null),
  topBuyValue: Joi.number().unsafe().allow(null),
  totalBuyValue: Joi.number().unsafe().allow(null),
  lastAcquiredAt: Joi.number().allow(null),
});

// Native order formats (for now, only WyvernV2 is supported)

export const wyvernV2OrderFormat = Joi.object({
  exchange: Joi.string().required(),
  maker: Joi.string().required(),
  taker: Joi.string().required(),
  makerRelayerFee: Joi.alternatives(Joi.number(), Joi.string()).required(),
  takerRelayerFee: Joi.alternatives(Joi.number(), Joi.string()).required(),
  feeRecipient: Joi.string().required(),
  side: Joi.number().valid(0, 1).required(),
  saleKind: Joi.number().valid(0, 1).required(),
  target: Joi.string().required(),
  howToCall: Joi.number().valid(0, 1).required(),
  calldata: Joi.string().required(),
  replacementPattern: Joi.string().required(),
  staticTarget: Joi.string().required(),
  staticExtradata: Joi.string().required(),
  paymentToken: Joi.string().required(),
  basePrice: Joi.string().required(),
  extra: Joi.string().required(),
  listingTime: Joi.alternatives(Joi.number(), Joi.string()).required(),
  expirationTime: Joi.alternatives(Joi.number(), Joi.string()).required(),
  salt: Joi.string().required(),
  v: Joi.number().required(),
  r: Joi.string().required(),
  s: Joi.string().required(),
}).options({ allowUnknown: true });
