import { IOrder } from "./order";
import { getCurrentTimestamp, bn } from "../utils";
import { MatchParams, ReceivedItem } from "./types";
import { AddressZero } from "@ethersproject/constants";
import { utils } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";
import { BytesLike } from "ethers";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import * as Addresses from "./addresses";

export const SIP6_VERSION = 0;

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
  verifyingContract: Addresses.ReservoirCancellationZone[chainId],
});

function encodeContext(contextVersion: number, contextPayload: BytesLike) {
  return utils.solidityPack(["bytes1", "bytes"], [contextVersion, contextPayload]);
}

export const computeReceivedItems = (order: IOrder, matchParams: MatchParams): ReceivedItem[] => {
  return order.params.consideration.map((c) => ({
    ...c,
    // All criteria items should have been resolved
    itemType: c.itemType > 3 ? c.itemType - 2 : c.itemType,
    // Adjust the amount to the quantity filled (won't work for dutch auctions)
    amount: bn(matchParams!.amount ?? 1)
      .mul(c.endAmount)
      .div(order.getInfo()!.amount)
      .toString(),
    identifier:
      c.itemType > 3 ? matchParams!.criteriaResolvers![0].identifier : c.identifierOrCriteria,
  }));
};

export async function signOrder(
  chainId: number,
  cosigner: TypedDataSigner,
  fulfiller: string,
  expiration: number,
  orderHash: string,
  context: BytesLike
) {
  return await cosigner._signTypedData(EIP712_DOMAIN(chainId), SIGNED_ORDER_EIP712_TYPE, {
    fulfiller,
    expiration,
    orderHash,
    context,
  });
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
  chainId: number,
  cosigner: TypedDataSigner,
  fulfiller: string,
  expiration: number,
  orderHash: string,
  consideration: ReceivedItem[]
) {
  const contextPayload = hashConsideration(consideration);
  const context: BytesLike = encodeContext(SIP6_VERSION, contextPayload);
  const signature = await signOrder(chainId, cosigner, fulfiller, expiration, orderHash, context);
  const extraData = utils.solidityPack(
    ["bytes1", "address", "uint64", "bytes", "bytes"],
    [SIP6_VERSION, fulfiller, expiration, convertSignatureToEIP2098(signature), context]
  );
  return [extraData, contextPayload];
}

export const cosignOrder = async (
  order: IOrder,
  cosigner: TypedDataSigner,
  matchParams: MatchParams
) => {
  const orderHash = order.hash();
  const consideration = computeReceivedItems(order, matchParams);
  const fulfiller = AddressZero;
  const expiration = getCurrentTimestamp(300);
  const [extraDataComponent, requiredReceivedItemsHash] = await encodeExtraData(
    order.chainId,
    cosigner,
    fulfiller,
    expiration,
    orderHash,
    consideration
  );
  return {
    extraDataComponent,
    substandardResponses: [{ requiredReceivedItems: consideration, requiredReceivedItemsHash }],
  };
};
