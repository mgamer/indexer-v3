import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { bn } from "@/common/utils";

type AbiParam =
  | {
      kind: "unknown";
      abiType: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      abiValue: any;
    }
  | {
      kind: "quantity";
      abiType: string;
    }
  | {
      kind: "recipient";
      abiType: string;
    }
  | {
      kind: "contract";
      abiType: string;
    };

export type MintTx = {
  to: string;
  data: {
    signature: string;
    params: AbiParam[];
  };
};

export const generateMintTxData = (
  tx: MintTx,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  const abiData = tx.data.params.map((p) => {
    switch (p.kind) {
      case "contract": {
        return {
          abiType: p.abiType,
          abiValue: contract,
        };
      }

      case "quantity": {
        return {
          abiType: p.abiType,
          abiValue: quantity,
        };
      }

      case "recipient": {
        return {
          abiType: p.abiType,
          abiValue: minter,
        };
      }

      default: {
        return {
          abiType: p.abiType,
          abiValue: p.abiValue,
        };
      }
    }
  });

  const data =
    tx.data.signature +
    (abiData.length
      ? defaultAbiCoder
          .encode(
            abiData.map(({ abiType }) => abiType),
            abiData.map(({ abiValue }) => abiValue)
          )
          .slice(2)
      : "");

  return {
    from: minter,
    to: tx.to,
    data,
    value: bn(price).mul(quantity).toHexString(),
  };
};
