import { Wallet } from "@ethersproject/wallet";
import { verifyTypedData } from "@ethersproject/wallet";
import { config } from "@/config/index";
import { saveOffChainCancellations } from "@/utils/offchain-cancel";

export const cosigner = () => new Wallet(config.cosignerPrivateKey);

// Reuse the cancellation format of `seaport` orders
export const generateOffChainCancellationSignatureData = (orderIds: string[]) => {
  return {
    signatureKind: "eip712",
    domain: {
      name: "Off-Chain Cancellation",
      version: "1.0.0",
      chainId: config.chainId,
    },
    types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
    value: {
      orderHashes: orderIds,
    },
    primaryType: "OrderHashes",
  };
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

export const doCancel = async ({
  orderIds,
  signature,
  maker,
}: {
  orderIds: string[];
  signature: string;
  maker: string;
}) => {
  const success = verifyOffChainCancellationSignature(orderIds, signature, maker);
  if (!success) {
    throw new Error("Cancellation failed");
  }

  // Save cancellations
  await saveOffChainCancellations(orderIds);
};
