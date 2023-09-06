import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type PermitMessage = {
  owner: string;
  spender: string;
  value: string;
  nonce: string;
  deadline: string;
  signature?: string;
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
        owner,
        spender,
        value,
        nonce,
        deadline,
        signature
      ) VALUES (
        $/id/,
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
    value: result.value,
    nonce: result.nonce,
    deadline: result.deadline,
    signature: result.signature,
  };
};
