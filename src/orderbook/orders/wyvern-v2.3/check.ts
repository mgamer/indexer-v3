import * as Sdk from "@reservoir0x/sdk";
import { BaseOrderInfo } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { db } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";

// TODO: Add support for on-chain check

export const offChainCheck = async (
  order: Sdk.WyvernV23.Order,
  info: BaseOrderInfo
) => {
  const localTarget = await db.oneOrNone(
    `
      SELECT "c"."kind" FROM "contracts" "c"
      WHERE "c"."address" = $/address/
    `,
    { address: toBuffer(info.contract) }
  );

  // Check: order has a valid target
  const contractKind = order.params.kind?.split("-")[0];
  if (!localTarget || localTarget.kind !== contractKind) {
    throw new Error("invalid-target");
  }

  if (order.params.side === Sdk.WyvernV23.Types.OrderSide.BUY) {
    // Check: maker has enough balance
    const balanceResult = await db.oneOrNone(
      `
        SELECT "fb"."amount" FROM "ft_balances" "fb"
        WHERE "fb"."contract" = $/contract/
          AND "fb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(order.params.paymentToken),
        owner: toBuffer(order.params.maker),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(order.params.basePrice)) {
      throw new Error("no-balance");
    }

    // Check: maker has set the proper approval
    // TODO: above check
  } else {
    // Check: maker has initialized a user proxy
    // TODO: above check

    // Check: maker has enough balance
    const balanceResult = await db.oneOrNone(
      `
        SELECT "nb"."amount" FROM "nft_balances" "nb"
        WHERE "nb"."contract" = $/contract/
          AND "nb"."token_id" = $/tokenId/
          AND "nb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(info.contract),
        tokenId: (info as any).tokenId,
        owner: toBuffer(order.params.maker),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(1)) {
      throw new Error("no-balance");
    }

    // Check: maker has set the proper approval
    // TODO: above check
  }
};
