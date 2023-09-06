import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { hexZeroPad } from "@ethersproject/bytes";
import { Contract } from "@ethersproject/contracts";
import { Network, bn } from "../../utils";
// import { keccak256 } from "@ethersproject/solidity";

export type Permit = {
  chainId: number;
  token: string;
  owner: string;
  spender: string;
  amount: string;
  deadline: string;
};

export async function createPermitMessage(permit: Permit, provider: Provider) {
  const tokenContract = new Contract(
    permit.token,
    new Interface([
      "function nonces(address owner) external view returns (uint256)",
      "function name() external view returns (string)",
      "function version() external view returns (string)",
      "function EIP712_VERSION() external view returns (string)",
    ]),
    provider
  );
  const [nonce, name, version] = await Promise.all([
    tokenContract.nonces(permit.owner),
    tokenContract.name(),
    tokenContract.version().catch(() => tokenContract.EIP712_VERSION()),
  ]);

  const message = {
    signatureKind: "eip712",
    domain: [Network.Polygon, Network.Mumbai].includes(permit.chainId)
      ? {
          name,
          version,
          salt: hexZeroPad(bn(permit.chainId).toHexString(), 32),
          verifyingContract: permit.token,
        }
      : {
          name,
          version,
          chainId: permit.chainId,
          verifyingContract: permit.token,
        },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    value: {
      owner: permit.owner,
      spender: permit.spender,
      value: permit.amount,
      nonce: nonce.toString(),
      deadline: permit.deadline,
    },
  };

  //   const id = keccak256(
  //     ["string"],
  //     [JSON.stringify(message)]
  //   );

  return message;
}
