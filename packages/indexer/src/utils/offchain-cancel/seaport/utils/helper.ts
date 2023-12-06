import * as Sdk from "@reservoir0x/sdk";
import { OrderComponents, ReceivedItem } from "@reservoir0x/sdk/dist/seaport-base/types";
import { BigNumber, utils } from "ethers";
import { BytesLike } from "ethers";
import { config } from "@/config/index";
import { Features } from "./features";
import type { OrderSignatureRequestItem, SignatureRequestContext } from "../index";
import { _TypedDataEncoder } from "ethers/lib/utils";
import { cosigner } from "../../index";
import { baseProvider } from "@/common/provider";

const ZONE_SUBSTANDARD_INDEX = 0;
export const SIP6_VERSION = 0;

export async function latestTimestamp(): Promise<number> {
  return (await baseProvider.getBlock("latest")).timestamp;
}

export const CONSIDERATION_EIP712_TYPE = {
  Consideration: [{ name: "consideration", type: "ReceivedItem[]" }],
  ReceivedItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifier", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};

export const SIGNED_ORDER_EIP712_TYPE = {
  SignedOrder: [
    { name: "fulfiller", type: "address" },
    { name: "expiration", type: "uint64" },
    { name: "orderHash", type: "bytes32" },
    { name: "context", type: "bytes" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "SignedZone",
  version: "1.0.0",
  chainId,
  verifyingContract: Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId],
});

export enum ValidationError {
  NONE,
  WRONG_ORDER_SIGNATURE,
  SIGNER_MISMATCH,
  SALT_MISSING,
}

export type SignedOrder = {
  extraDataComponent?: BytesLike;
  orderParameters?: OrderComponents;
  substandardResponses?: [
    {
      requiredReceivedItems: ReceivedItem[];
      requiredReceivedItemsHash: BytesLike;
    }
  ];
  error?: string;
  message?: string;
};

export type HashingResult = {
  orderHashes?: string[];
  orderSigner?: string;
  error: ValidationError;
  erroredOrderHash?: string;
};

export async function signOrder(
  fulfiller: string,
  expiration: number,
  orderHash: string,
  context: BytesLike
) {
  const wallet = cosigner();
  return await wallet._signTypedData(EIP712_DOMAIN(config.chainId), SIGNED_ORDER_EIP712_TYPE, {
    fulfiller,
    expiration,
    orderHash,
    context,
  });
}

export function hashOrder(orderData: OrderComponents) {
  const order = new Sdk.SeaportV14.Order(config.chainId, orderData);
  return order.hash();
}

export async function hashOrders(
  orders: OrderComponents[],
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
): Promise<HashingResult> {
  let orderSigner = "";
  const orderHashes = [];
  for (let i = 0; i < orders.length; i++) {
    const orderData = orders[i];
    const order = createOrder(config.chainId, orderData, orderKind);
    const orderHash = order.hash();
    try {
      await order.checkSignature();
    } catch (e) {
      return { error: ValidationError.WRONG_ORDER_SIGNATURE, erroredOrderHash: orderHash };
    }

    if (!orderSigner) {
      orderSigner = order.params.offerer;
    } else if (order.params.offerer != orderSigner) {
      return { error: ValidationError.SIGNER_MISMATCH, erroredOrderHash: orderHash };
    }
    orderHashes.push(orderHash);
  }

  return { orderHashes, orderSigner, error: ValidationError.NONE };
}

export async function getReplacedOrderHashes(
  replacedOrders: OrderComponents[],
  newOrders: OrderComponents[],
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
): Promise<HashingResult> {
  const result = await hashOrders(replacedOrders, orderKind);
  const { orderHashes, orderSigner, error } = result;
  if (error != ValidationError.NONE) {
    return result;
  }

  const replacedOrdersByHash = new Map(orderHashes!.map((hash, i) => [hash, replacedOrders[i]]));
  const salts = [];

  for (let i = 0; i < newOrders.length; i++) {
    const orderData = newOrders[i];
    const order = createOrder(config.chainId, orderData, orderKind);
    try {
      await order.checkSignature();
    } catch (e) {
      return { error: ValidationError.WRONG_ORDER_SIGNATURE, erroredOrderHash: order.hash() };
    }

    if (order.params.offerer != orderSigner) {
      return { error: ValidationError.SIGNER_MISMATCH, erroredOrderHash: order.hash() };
    }

    if (BigNumber.from(order.params.salt).isZero()) {
      return { error: ValidationError.SALT_MISSING, erroredOrderHash: order.hash() };
    }

    const replacedOrder = replacedOrdersByHash.get(order.params.salt);

    if (!replacedOrder || replacedOrder.offerer != orderSigner) {
      return { error: ValidationError.SIGNER_MISMATCH, erroredOrderHash: order.hash() };
    }
    salts.push(order.params.salt);
  }
  return { orderHashes: salts, orderSigner, error: ValidationError.NONE };
}

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

export async function processOrder(
  context: SignatureRequestContext,
  order: OrderSignatureRequestItem
): Promise<SignedOrder> {
  const { orderParameters, substandardRequests, fulfiller } = order;
  const orderHash = hashOrder(orderParameters);
  const consideration = substandardRequests[ZONE_SUBSTANDARD_INDEX].requestedReceivedItems;

  const features = new Features(orderParameters.zoneHash);

  if (features.checkFlagged()) {
    const flagged = await context.flaggingChecker.containsFlagged(consideration);
    if (flagged) {
      throw new Error("FLAGGING_ERROR");
    }
  }

  const [extraDataComponent, requiredReceivedItemsHash] = await encodeExtraData(
    fulfiller,
    context.expiration,
    orderHash,
    consideration
  );
  return {
    orderParameters,
    extraDataComponent,
    substandardResponses: [{ requiredReceivedItems: consideration, requiredReceivedItemsHash }],
  };
}

export const convertSignatureToEIP2098 = (signature: string) => {
  if (signature.length === 130) {
    return signature;
  }

  if (signature.length !== 132) {
    throw Error("invalid signature length (must be 64 or 65 bytes)");
  }

  return utils.splitSignature(signature).compact;
};

export function hashConsideration(consideration: ReceivedItem[]): BytesLike {
  return _TypedDataEncoder.hashStruct("Consideration", CONSIDERATION_EIP712_TYPE, {
    consideration,
  });
}

async function encodeExtraData(
  fulfiller: string,
  expiration: number,
  orderHash: string,
  consideration: ReceivedItem[]
) {
  const contextPayload = hashConsideration(consideration);
  const context: BytesLike = encodeContext(SIP6_VERSION, contextPayload);
  const signature = await signOrder(fulfiller, expiration, orderHash, context);
  const extraData = utils.solidityPack(
    ["bytes1", "address", "uint64", "bytes", "bytes"],
    [SIP6_VERSION, fulfiller, expiration, convertSignatureToEIP2098(signature), context]
  );
  return [extraData, contextPayload];
}

function encodeContext(contextVersion: number, contextPayload: BytesLike) {
  return utils.solidityPack(["bytes1", "bytes"], [contextVersion, contextPayload]);
}
