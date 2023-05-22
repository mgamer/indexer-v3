import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { bn } from "@/common/utils";

export type MintDetails =
  | {
      kind: "empty";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric-address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address-numeric";
      methodSignature: string;
      methodParams: string;
    };

export const getMintTxData = (
  details: MintDetails,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  let calldata: string | undefined;
  switch (details.kind) {
    case "empty": {
      calldata = details.methodSignature;
      break;
    }

    case "numeric": {
      const params = details.methodParams.split(",");
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [quantity]).slice(2);
      break;
    }

    case "address": {
      const params = details.methodParams.split(",");
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [minter]).slice(2);
      break;
    }

    case "numeric-address": {
      const params = details.methodParams.split(",");
      calldata =
        details.methodSignature + defaultAbiCoder.encode(params, [quantity, minter]).slice(2);
      break;
    }

    case "address-numeric": {
      const params = details.methodParams.split(",");
      calldata =
        details.methodSignature + defaultAbiCoder.encode(params, [minter, quantity]).slice(2);
      break;
    }
  }

  if (!calldata) {
    throw new Error("Mint not supported");
  }

  return {
    from: minter,
    to: contract,
    data: calldata,
    value: bn(price).mul(quantity).toHexString(),
  };
};
