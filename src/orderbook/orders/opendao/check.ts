import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

// TODO: Add support for on-chain check

export const offChainCheck = async (
  order: Sdk.OpenDao.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid.
    onChainApprovalRecheck?: boolean;
  }
) => {
  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.nft);
  if (!kind || kind !== order.params.kind?.split("-")[0]) {
    throw new Error("invalid-target");
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    `opendao-${kind}`,
    order.params.maker,
    order.params.nonce
  );
  if (nonceCancelled) {
    throw new Error("invalid-nonce");
  }

  const feeAmount = order.getFeeAmount();

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.direction === Sdk.OpenDao.Types.TradeDirection.BUY) {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.params.erc20Token, order.params.maker);
    if (ftBalance.lt(bn(order.params.erc20TokenAmount).add(feeAmount))) {
      hasBalance = false;
    }

    // TODO: Integrate off-chain approval checking
    if (options?.onChainApprovalRecheck) {
      const erc20 = new Sdk.Common.Helpers.Erc20(baseProvider, order.params.erc20Token);
      if (
        bn(
          await erc20.getAllowance(
            order.params.maker,
            Sdk.OpenDao.Addresses.Exchange[config.chainId]
          )
        ).lt(bn(order.params.erc20TokenAmount).add(feeAmount))
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.nft,
      order.params.nftId,
      order.params.maker
    );
    if (nftBalance.lt(order.params.nftAmount ?? 1)) {
      hasBalance = false;
    }

    const operator = Sdk.OpenDao.Addresses.Exchange[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.nft,
      order.params.maker,
      operator
    );
    if (!nftApproval) {
      hasApproval = false;
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
