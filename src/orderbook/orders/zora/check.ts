import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";
import { OrderInfo } from "./index";

export const offChainCheck = async (
  order: OrderInfo["orderParams"],
  options?: {
    onChainApprovalRecheck?: boolean;
  }
) => {
  let hasBalance = true;
  let hasApproval = true;

  if (order.side === "buy") {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.askCurrency, order.maker);
    if (ftBalance.lt(order.askPrice)) {
      hasBalance = true;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.askCurrency,
              order.maker,
              Sdk.Zora.Addresses.Erc20TransferHelper[config.chainId]
            )
            .then((a) => a.value)
        ).lt(order.askPrice)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.tokenContract,
      order.tokenId.toString(),
      order.seller
    );

    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    const operator = Sdk.Zora.Addresses.Erc721TransferHelper[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.tokenContract,
      order.seller,
      operator
    );

    // Re-validate the approval on-chain to handle some edge-cases
    const contract = new Sdk.Common.Helpers.Erc721(baseProvider, order.tokenContract);

    if (!hasBalance) {
      // Fetch token owner on-chain
      const owner = await contract.getOwner(order.tokenId);
      if (owner.toLocaleLowerCase() === order.seller) {
        hasBalance = true;
      }
    }

    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        if (!(await contract.isApproved(order.seller, operator))) {
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
