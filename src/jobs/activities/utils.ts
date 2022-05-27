import crypto from "crypto";
import { idb } from "@/common/db";
import { Tokens } from "@/models/tokens";
import { Attributes } from "@/models/attributes";
import { Collections } from "@/models/collections";

export function getActivityHash(...params: string[]) {
  return crypto
    .createHash("sha256")
    .update(`${params.join("")}`)
    .digest("hex");
}

export async function getBidInfoByOrderId(orderId: string) {
  let tokenId;
  let collectionId;

  const tokenSetByOrderIdResult = await idb.oneOrNone(
    `
                SELECT
                  ts.token_set_id,
                  ts.attribute_id
                FROM orders
                JOIN token_sets ts
                  ON orders.token_set_id = ts.token_set_id
                WHERE orders.id = $/orderId/
                LIMIT 1
            `,
    {
      orderId: orderId,
    }
  );

  if (tokenSetByOrderIdResult.token_set_id.startsWith("token:")) {
    let contract;

    [, contract, tokenId] = tokenSetByOrderIdResult.token_set_id.split(":");

    const token = await Tokens.getByContractAndTokenId(contract, tokenId);
    collectionId = token?.collectionId;
  } else if (tokenSetByOrderIdResult.token_set_id.startsWith("list:")) {
    const attribute = await Attributes.getById(tokenSetByOrderIdResult.attribute_id);
    collectionId = attribute?.collectionId;
  } else if (tokenSetByOrderIdResult.token_set_id.startsWith("range:")) {
    const collection = await Collections.getByTokenSetId(tokenSetByOrderIdResult.token_set_id);
    collectionId = collection?.id;
  } else {
    [, collectionId] = tokenSetByOrderIdResult.token_set_id.split(":");
  }

  return [collectionId, tokenId, tokenSetByOrderIdResult.attribute_id];
}
