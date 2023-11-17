import { Wallet } from "@ethersproject/wallet";
import { config } from "@/config/index";
import { verifyTypedData } from "@ethersproject/wallet";
import { OrderKind } from "@/orderbook/orders";
import { idb } from "@/common/db";
import { toBuffer, now } from "@/common/utils";

export function getCosigner() {
  return new Wallet(config.cosignerPrivateKey);
}

export function getCosignerAddress() {
  return getCosigner().address;
}

export function generateCancelMessage(orderIds: string[], cosigner: string) {
  return {
    signatureKind: "eip712",
    domain: {
      name: "SignedZone",
      version: "1.0.0",
      chainId: config.chainId,
      verifyingContract: cosigner,
    },
    types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
    value: {
      orderHashes: orderIds,
    },
    primaryType: "OrderHashes",
  };
}

export function generateOffChainCancleStep(orderIds: string[], cosigner: string) {
  return {
    id: "cancellation-signature",
    action: "Cancel order",
    description: "Authorize the cancellation of the order",
    kind: "signature",
    items: [
      {
        status: "incomplete",
        data: {
          sign: generateCancelMessage(orderIds, cosigner),
          post: {
            endpoint: "/execute/cancel-signature/v1",
            method: "POST",
            body: {
              orderIds: orderIds.sort(),
              orderKind: "payment-processor-v2",
            },
          },
        },
      },
    ],
  };
}

export function verifyOffChainCancleSignature(
  orderIds: string[],
  cosigner: string,
  signature: string,
  signer: string
) {
  const message = generateCancelMessage(orderIds, cosigner);
  const recoveredSigner = verifyTypedData(message.domain, message.types, message.value, signature);
  return recoveredSigner.toLowerCase() === signer.toLowerCase();
}

export async function saveCancellation(orderId: string, kind: OrderKind, owner: string) {
  await idb.none(
    `
            INSERT INTO cancellations (
                order_id,
                owner,
                order_kind,
                timestamp
            ) VALUES (
                $/orderId/,
                $/owner/,
                $/kind/,
                $/timestamp/
            ) ON CONFLICT DO NOTHING
            `,
    {
      orderId,
      owner: toBuffer(owner),
      kind,
      timestamp: now(),
    }
  );
}
