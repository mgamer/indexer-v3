import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type PermitMessage = {
  owner: string;
  spender: string;
  value: string;
  nonce: string;
  deadline: string;
  signature?: string;
  token: string;
};

export const savePermitBidding = async (
  permitId: string,
  message: PermitMessage,
  signature: string
) => {
  await idb.none(
    `
      INSERT INTO permit_biddings(
        id,
        token,
        owner,
        spender,
        value,
        nonce,
        deadline,
        signature
      ) VALUES (
        $/id/,
        $/token/,
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
      owner: toBuffer(message.owner),
      spender: toBuffer(message.spender),
      token: toBuffer(message.token),
      nonce: message.nonce,
      deadline: message.deadline,
      signature: signature,
      value: message.value,
    }
  );
};

export const getPermitBidding = async (permitId: string): Promise<PermitMessage | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        permit_biddings.*
      FROM permit_biddings
      WHERE permit_biddings.id = $/id/
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
    nonce: result.nonce,
    deadline: result.deadline,
    signature: result.signature,
  };
};

export const getActiveOrdersMaxNonce = async (
  owner: string,
  token: string
): Promise<string | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        max(permit_biddings.nonce) as nonce
      FROM permit_biddings
      LEFT JOIN orders ON orders.permit_id = permit_biddings.id
      WHERE permit_biddings.owner = $/owner/
      AND permit_biddings.token = $/token/
      AND orders.fillability_status = 'fillable'
    `,
    { owner: toBuffer(owner), token: toBuffer(token) }
  );

  if (!result) {
    return undefined;
  }
  return result.nonce as string;
};
