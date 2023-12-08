import {
  MatchParams,
  OrderComponents,
  ReceivedItem,
} from "@reservoir0x/sdk/dist/seaport-base/types";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { saveOffChainCancellations } from "@/utils/offchain-cancel";
import { verifyTypedData } from "@ethersproject/wallet";
import { BigNumber } from "ethers";
import { Features, FlaggingChecker } from "./flagged";
import { cosigner } from "../index";

type OrderKind = "seaport-v1.4" | "seaport-v1.5" | "alienswap";
export const EXPIRATION_IN_S = 120;

export type CancelCall = {
  orderKind: OrderKind;
  signature: string;
  orders: OrderComponents[];
};

export type ReplacementCall = {
  orderKind: OrderKind;
  newOrders: OrderComponents[];
  replacedOrders: OrderComponents[];
};

export type OrderSignatureRequestItem = {
  fulfiller: string;
  marketplaceContract: string;
  orderParameters: OrderComponents;
  substandardRequests: {
    requestedReceivedItems: ReceivedItem[];
  }[];
};

export type SignatureCall = {
  orders: OrderSignatureRequestItem[];
};
export type SignatureRequestContext = {
  expiration: number;
  flaggingChecker: FlaggingChecker;
};

export function createOrder(
  chainId: number,
  orderData: OrderComponents,
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
): Sdk.SeaportV14.Order | Sdk.SeaportV15.Order | Sdk.Alienswap.Order {
  if (orderKind === "alienswap") {
    return new Sdk.Alienswap.Order(chainId, orderData);
  } else if (orderKind === "seaport-v1.4") {
    return new Sdk.SeaportV14.Order(chainId, orderData);
  } else {
    return new Sdk.SeaportV15.Order(chainId, orderData);
  }
}

export async function hashOrders(
  orders: OrderComponents[],
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
) {
  let orderSigner = "";
  const orderHashes = [];
  for (let i = 0; i < orders.length; i++) {
    const orderData = orders[i];
    const order = createOrder(config.chainId, orderData, orderKind);
    const orderHash = order.hash();
    try {
      await order.checkSignature();
    } catch (e) {
      throw new Error("WRONG_ORDER_SIGNATURE");
    }

    if (!orderSigner) {
      orderSigner = order.params.offerer;
    } else if (order.params.offerer != orderSigner) {
      throw new Error("SIGNER_MISMATCH");
    }
    orderHashes.push(orderHash);
  }
  return { orderHashes, orderSigner };
}

export const verifyOffChainCancellationSignature = (
  orderIds: string[],
  signature: string,
  signer: string
) => {
  const message = generateOffChainCancellationSignatureData(orderIds);
  const recoveredSigner = verifyTypedData(message.domain, message.types, message.value, signature);
  return recoveredSigner.toLowerCase() === signer.toLowerCase();
};

export const generateOffChainCancellationSignatureData = (orderIds: string[]) => {
  const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
  return {
    signatureKind: "eip712",
    domain: {
      name: "SignedZone",
      version: "1.0.0",
      chainId: config.chainId,
      verifyingContract: cancellationZone,
    },
    types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
    value: {
      orderHashes: orderIds,
    },
    primaryType: "OrderHashes",
  };
};

export const doCancel = async (data: CancelCall) => {
  const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
  const orders = data.orders;

  if (orders.some((order) => order.zone !== cancellationZone)) {
    throw Error("Unauthorized");
  }

  const { orderHashes, orderSigner } = await hashOrders(orders, data.orderKind);
  if (!orderHashes || !orderSigner) {
    throw Error("Unauthorized");
  }

  const success = verifyOffChainCancellationSignature(orderHashes, data.signature, orderSigner!);

  if (!success) {
    throw Error("Unauthorized");
  }

  await saveOffChainCancellations(orderHashes!);
};

export const doReplacement = async (data: ReplacementCall) => {
  const { replacedOrders, newOrders, orderKind } = data;
  const result = await hashOrders(replacedOrders, orderKind);
  const { orderHashes, orderSigner } = result;
  const replacedOrdersByHash = new Map(orderHashes!.map((hash, i) => [hash, replacedOrders[i]]));
  const salts = [];

  for (let i = 0; i < newOrders.length; i++) {
    const orderData = newOrders[i];
    const order = createOrder(config.chainId, orderData, orderKind);
    try {
      await order.checkSignature();
    } catch (e) {
      throw new Error("WRONG_ORDER_SIGNATURE");
    }

    if (order.params.offerer != orderSigner) {
      throw new Error("SIGNER_MISMATCH");
    }

    if (BigNumber.from(order.params.salt).isZero()) {
      throw new Error("SALT_MISSING");
    }

    const replacedOrder = replacedOrdersByHash.get(order.params.salt);

    if (!replacedOrder || replacedOrder.offerer != orderSigner) {
      throw new Error("SIGNER_MISMATCH");
    }
    salts.push(order.params.salt);
  }

  await saveOffChainCancellations(salts);
};

export const doSignOrder = async (
  order: Sdk.SeaportV14.Order | Sdk.SeaportV15.Order | Sdk.Alienswap.Order,
  matchParams: MatchParams
) => {
  if (!order.isCosignedOrder()) return;
  const features = new Features(order.params.zoneHash);
  if (features.checkFlagged()) {
    const requestedReceivedItems = order.getReceivedItems(matchParams);
    const flaggingChecker = new FlaggingChecker(requestedReceivedItems);
    const flagged = await flaggingChecker.containsFlagged(requestedReceivedItems);
    if (flagged) {
      throw new Error("FLAGGING_ERROR");
    }
  }

  await order.cosign(cosigner(), matchParams);
};
