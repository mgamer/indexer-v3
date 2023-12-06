import { OrderComponents, ReceivedItem } from "@reservoir0x/sdk/dist/seaport-base/types";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { saveOffChainCancellations } from "@/utils/offchain-cancel";
import { hashOrders, createOrder, latestTimestamp, processOrder } from "./utils/helper";
import { verifyTypedData } from "@ethersproject/wallet";
import { FlaggingChecker } from "./utils/flagged";
import { BigNumber } from "ethers";

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
  const { orderHashes, orderSigner, error } = result;
  if (error) {
    throw new Error("failed");
  }

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

export const doSignOrders = async (data: SignatureCall) => {
  const { orders } = data;
  const signedOrders = [];
  const expiration = (await latestTimestamp()) + EXPIRATION_IN_S;
  const context = {
    expiration,
    flaggingChecker: new FlaggingChecker(
      orders.map((o) => o.substandardRequests[0].requestedReceivedItems ?? [])
    ),
  };
  for (let i = 0; i < orders.length; i++) {
    signedOrders.push(await processOrder(context, orders[i]));
  }
  return {
    orders: signedOrders,
  };
};
