import { Exchange as SeaportV14Exchange } from "../seaport-v1.4/exchange";
import { Contract } from "@ethersproject/contracts";
import * as Addresses from "./addresses";
import ExchangeAbi from "./abis/Exchange.json";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { ORDER_EIP712_TYPES, IOrder } from "../seaport-base/order";
import { EIP712_DOMAIN } from "./order";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Types from "../seaport-base/types";
import { keccak256 } from "@ethersproject/keccak256";
import { MerkleTree } from "merkletreejs";

export class Exchange extends SeaportV14Exchange {
  protected exchangeAddress: string;
  protected cancellationZoneAddress: string = AddressZero;
  public contract: Contract;

  constructor(chainId: number) {
    super(chainId);
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.contract = new Contract(this.exchangeAddress, ExchangeAbi);
  }

  public getBulkSignatureDataWithProofs(orders: IOrder[]) {
    const height = Math.max(Math.ceil(Math.log2(orders.length)), 1);
    const size = Math.pow(2, height);

    const types = { ...ORDER_EIP712_TYPES };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (types as any).BulkOrder = [{ name: "tree", type: `OrderComponents${`[2]`.repeat(height)}` }];
    const encoder = _TypedDataEncoder.from(types);

    const hashElement = (element: Types.OrderComponents) =>
      encoder.hashStruct("OrderComponents", element);

    const elements = orders.map((o) => o.params);
    const leaves = elements.map((e) => hashElement(e));

    const defaultElement: Types.OrderComponents = {
      offerer: AddressZero,
      zone: AddressZero,
      offer: [],
      consideration: [],
      orderType: 0,
      startTime: 0,
      endTime: 0,
      zoneHash: HashZero,
      salt: "0",
      conduitKey: HashZero,
      counter: "0",
    };
    const defaultLeaf = hashElement(defaultElement);

    // Ensure the tree is complete
    while (elements.length < size) {
      elements.push(defaultElement);
      leaves.push(defaultLeaf);
    }

    const hexToBuffer = (value: string) => Buffer.from(value.slice(2), "hex");
    const bufferKeccak = (value: string) => hexToBuffer(keccak256(value));

    const tree = new MerkleTree(leaves.map(hexToBuffer), bufferKeccak, {
      complete: true,
      sort: false,
      hashLeaves: false,
      fillDefaultHash: hexToBuffer(defaultLeaf),
    });

    let chunks: object[] = [...elements];
    while (chunks.length > 2) {
      const newSize = Math.ceil(chunks.length / 2);
      chunks = Array(newSize)
        .fill(0)
        .map((_, i) => chunks.slice(i * 2, (i + 1) * 2));
    }

    return {
      signatureData: {
        signatureKind: "eip712",
        domain: EIP712_DOMAIN(this.chainId),
        types: types,
        value: { tree: chunks },
      },
      proofs: orders.map((_, i) => tree.getHexProof(leaves[i], i)),
    };
  }

  // --- Get extra data ---
  // not support off chain cancellation at present
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public requiresExtraData(_order_: IOrder): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getExtraData(_order: IOrder): Promise<string> {
    return "0x";
  }
}
