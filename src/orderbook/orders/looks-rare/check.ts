import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { idb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";

// TODO: Add support for on-chain check

export const offChainCheck = async (
  order: Sdk.LooksRare.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid.
    onChainSellApprovalRecheck?: boolean;
  }
) => {
  const localTarget = await idb.oneOrNone(
    `
      SELECT kind FROM contracts
      WHERE contracts.address = $/address/
    `,
    { address: toBuffer(order.params.collection) }
  );

  // Check: order has a valid target
  if (!localTarget) {
    throw new Error("invalid-target");
  }

  // Check: order's nonce was not bulk cancelled
  const bulkCancelResult = await idb.oneOrNone(
    `
      SELECT coalesce(
        (
          SELECT min_nonce FROM bulk_cancel_events
          WHERE order_kind = 'looks-rare'
            AND maker = $/maker/
          ORDER BY min_nonce DESC
          LIMIT 1
        ),
        0
      ) AS nonce
    `,
    { maker: toBuffer(order.params.signer) }
  );
  if (!bulkCancelResult || bulkCancelResult.nonce > order.params.nonce) {
    throw new Error("invalid-nonce");
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelResult = await idb.oneOrNone(
    `
      SELECT nonce FROM nonce_cancel_events
      WHERE order_kind = 'looks-rare'
        AND maker = $/maker/
        AND nonce = $/nonce/
    `,
    {
      maker: toBuffer(order.params.signer),
      nonce: order.params.nonce,
    }
  );
  if (nonceCancelResult && nonceCancelResult.nonce === order.params.nonce) {
    throw new Error("invalid-nonce");
  }

  if (!order.params.isOrderAsk) {
    // Check: maker has enough balance
    const balanceResult = await idb.oneOrNone(
      `
        SELECT "fb"."amount" FROM "ft_balances" "fb"
        WHERE "fb"."contract" = $/contract/
          AND "fb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(order.params.currency),
        owner: toBuffer(order.params.signer),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(order.params.price)) {
      throw new Error("no-balance");
    }

    // Check: maker has set the proper approval
    // TODO: above check
  } else {
    // Check: maker has enough balance
    const balanceResult = await idb.oneOrNone(
      `
        SELECT "nb"."amount" FROM "nft_balances" "nb"
        WHERE "nb"."contract" = $/contract/
          AND "nb"."token_id" = $/tokenId/
          AND "nb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(order.params.collection),
        tokenId: order.params.tokenId,
        owner: toBuffer(order.params.signer),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(1)) {
      throw new Error("no-balance");
    }

    const operator =
      localTarget.kind === "erc721"
        ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
        : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId];

    // Check: maker has set the proper approval
    const approvalResult = await idb.oneOrNone(
      `
        SELECT "nae"."approved" FROM "nft_approval_events" "nae"
        WHERE "nae"."address" = $/address/
          AND "nae"."owner" = $/owner/
          AND "nae"."operator" = $/operator/
        ORDER BY "nae"."block" DESC
        LIMIT 1
      `,
      {
        address: toBuffer(order.params.collection),
        owner: toBuffer(order.params.signer),
        operator: toBuffer(operator),
      }
    );
    if (!approvalResult || !approvalResult.approved) {
      if (options?.onChainSellApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          localTarget.kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection);
        if (!(await contract.isApproved(order.params.signer, operator))) {
          throw new Error("no-approval");
        }
      } else {
        throw new Error("no-approval");
      }
    }
  }
};
