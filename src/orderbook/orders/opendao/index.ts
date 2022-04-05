import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

// TODO: Add support for on-chain check

export const offChainCheck = async (order: Sdk.OpenDao.Order) => {
  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.nft);
  if (!kind || kind !== order.params.kind?.split("-")[0]) {
    throw new Error("invalid-target");
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    "opendao",
    order.params.maker,
    order.params.nonce
  );
  if (nonceCancelled) {
    throw new Error("invalid-nonce");
  }

  let feeAmount = bn(0);
  for (const { amount } of order.params.fees) {
    feeAmount = feeAmount.add(amount);
  }
  if (order.params.direction === Sdk.OpenDao.Types.TradeDirection.BUY) {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.params.erc20Token, order.params.maker);
    if (ftBalance.lt(bn(order.params.erc20TokenAmount).add(feeAmount))) {
      throw new Error("no-balance");
    }

    // TODO: Check: maker has set the proper approval
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.nft,
      order.params.nftId,
      order.params.maker
    );
    if (nftBalance.lt(order.params.nftAmount ?? 1)) {
      throw new Error("no-balance");
    }

    const operator = Sdk.OpenDao.Addresses.Exchange[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.nft,
      order.params.maker,
      operator
    );
    if (!nftApproval) {
      throw new Error("no-approval");
    }
  }
};
