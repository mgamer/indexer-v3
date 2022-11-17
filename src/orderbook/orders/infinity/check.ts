import * as Sdk from "@reservoir0x/sdk";
import { Sdk as tmpSdk } from "@/tmp/index"; // TODO joe update this to use the new sdk
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { now } from "lodash";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: tmpSdk.Infinity.Order,
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
  const contracts = order.nfts.map((item) => item.collection);

  for (const contract of contracts) {
    const kind = await commonHelpers.getContractKind(contract);
    if (!kind) {
      throw new Error("invalid-target");
    } else if (kind === "erc1155") {
      throw new Error("invalid-target");
    }
  }

  const minNonce = await commonHelpers.getMinNonce("infinity", order.signer);
  const isNonceCancelled = await commonHelpers.isNonceCancelled(
    "infinity",
    order.signer,
    order.nonce
  );

  if (minNonce.gt(order.nonce) || isNonceCancelled) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.isSellOrder) {
    let balance = 0;
    const operator = tmpSdk.Infinity.Addresses.Exchange[config.chainId];
    for (const nft of order.nfts) {
      const nftApproval = await checkApproval(
        nft.collection,
        order.signer,
        operator,
        "erc721",
        !!options?.checkFilledOrCancelled
      );
      hasApproval = hasApproval && nftApproval;

      for (const token of nft.tokens) {
        const tokenBalance = await commonHelpers.getNftBalance(
          nft.collection,
          token.tokenId,
          order.signer
        );
        // TODO @joe is this how we should handle this?
        // Is there a way to indicate the nfts which are owned?
        balance += tokenBalance.toNumber();
      }
    }
    if (balance < order.numItems) {
      hasBalance = false;
    }
  } else {
    const ftBalance = await commonHelpers.getFtBalance(order.currency, order.signer);

    const currentOrStartPrice =
      order.startTime < now() ? order.getMatchingPrice() ?? order.endPrice : order.startPrice;
    if (ftBalance.lt(currentOrStartPrice)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      const approval = await onChainData.fetchAndUpdateFtApproval(
        order.currency,
        order.signer,
        tmpSdk.Infinity.Addresses.Exchange[config.chainId]
      );
      hasApproval = bn(approval.value).gte(currentOrStartPrice);
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

const checkApproval = async (
  contractAddress: string,
  orderMaker: string,
  operator: string,
  kind: "erc721" | "erc1155" = "erc721",
  onChainApprovalRecheck = false
): Promise<boolean> => {
  const nftApproval = await commonHelpers.getNftApproval(contractAddress, orderMaker, operator);
  if (!nftApproval && onChainApprovalRecheck) {
    const contract =
      kind === "erc721"
        ? new Sdk.Common.Helpers.Erc721(baseProvider, contractAddress)
        : new Sdk.Common.Helpers.Erc1155(baseProvider, contractAddress);
    const isApproved = await contract.isApproved(orderMaker, operator);
    return isApproved;
  }

  return nftApproval;
};
