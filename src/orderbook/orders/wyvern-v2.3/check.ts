import * as Sdk from "@reservoir0x/sdk";
import { BaseOrderInfo } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as utils from "@/orderbook/orders/wyvern-v2.3/utils";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.WyvernV23.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid. We use the this option to validate approval
    // of buy orders as well.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
  }
) => {
  const id = order.prefixHash();

  const info = order.getInfo();
  if (!info) {
    throw new Error("unknown-format");
  }

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(info.contract);
  if (!kind || kind !== order.params.kind?.split("-")[0]) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(1)) {
      throw new Error("filled");
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce("wyvern-v2.3", order.params.maker);
  if (!minNonce.eq(order.params.nonce)) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.side === Sdk.WyvernV23.Types.OrderSide.BUY) {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(
      order.params.paymentToken,
      order.params.maker
    );
    if (ftBalance.lt(order.getMatchingPrice())) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.paymentToken,
              order.params.maker,
              Sdk.WyvernV23.Addresses.TokenTransferProxy[config.chainId]
            )
            .then((a) => a.value)
        ).lt(order.params.basePrice)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has initialized a proxy
    const proxy = await utils.getUserProxy(order.params.maker);
    if (!proxy) {
      throw new Error("no-user-proxy");
    }

    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      info.contract,
      (info as BaseOrderInfo & { tokenId: string }).tokenId,
      order.params.maker
    );
    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      info.contract,
      order.params.maker,
      proxy
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract = order.params.kind?.includes("erc721")
          ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
          : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract);
        if (!(await contract.isApproved(order.params.maker, proxy))) {
          hasApproval = false;
        }
      } else {
        hasApproval = false;
      }
    }
  }

  if (!hasBalance && !hasApproval) {
    throw new Error("no-balance-no-approval");
  } else if (!hasBalance) {
    throw new Error("no-balance");
  } else if (!hasApproval) {
    throw new Error("no-approval");
  }
};
