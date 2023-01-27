import { NFTPermit, Token } from "@reservoir0x/sdk/dist/router/v6/types";
import stringify from "json-stable-stringify";

import { redis } from "@/common/redis";

export const getNFTPermitId = (requestPayload: object, tokens: Token[]) =>
  stringify({ requestPayload, tokens });

export const saveNFTPermit = async (id: string, permit: NFTPermit, expiresIn = 10 * 60) =>
  redis.set(id, JSON.stringify(permit), "EX", expiresIn);

export const getNFTPermit = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as NFTPermit) : undefined));
