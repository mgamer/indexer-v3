import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { PermitApproval } from "@reservoir0x/sdk/dist/router/v6/types";

export const savePermitBidding = async (
  permitId: string,
  message: PermitApproval,
  signature: string,
  kind = "eip2612"
) => {
  await idb.none(
    `
      INSERT INTO permits(
        id,
        token,
        kind,
        index,
        owner,
        spender,
        value,
        nonce,
        deadline,
        signature
      ) VALUES (
        $/id/,
        $/token/,
        $/kind/,
        $/index/,
        $/owner/,
        $/spender/,
        $/value/,
        $/nonce/,
        $/deadline/,
        $/signature/
      )
    `,
    {
      id: permitId,
      kind,
      owner: toBuffer(message.owner),
      index: message.index ?? 0,
      spender: toBuffer(message.spender),
      token: toBuffer(message.token),
      nonce: message.nonce,
      deadline: message.deadline,
      signature: toBuffer(signature),
      value: message.value,
    }
  );
};

export const getPermitBidding = async (permitId: string): Promise<PermitApproval | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        permits.*
      FROM permits
      WHERE permits.id = $/id/
    `,
    { id: permitId }
  );
  if (!result) {
    return undefined;
  }

  return {
    owner: fromBuffer(result.owner),
    spender: fromBuffer(result.spender),
    token: fromBuffer(result.token),
    value: result.value,
    kind: result.kind,
    nonce: result.nonce,
    deadline: result.deadline,
    signature: fromBuffer(result.signature),
  };
};

export const getActiveOrdersMaxNonce = async (
  owner: string,
  token: string
): Promise<string | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        max(permits.nonce) as nonce
      FROM permits
      WHERE permits.owner = $/owner/
      AND permits.token = $/token/
    `,
    { owner: toBuffer(owner), token: toBuffer(token) }
  );

  if (!result) {
    return undefined;
  }
  return result.nonce as string;
};
