import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { TxData, getCurrentTimestamp } from "../../utils";
import * as ApprovalProxy from "./approval-proxy";
import RouterAbi from "./abis/ReservoirV6_0_1.json";
import PermitModuleAbi from "./abis/PermitModule.json";
import * as Addresses from "./addresses";
import { FTApproval } from "./types";

export type PermitTransfer = {
  approval: FTApproval;
  transferDetails: ApprovalProxy.TransferItem[];
  signature?: string;
};

export type TransferDetail = {
  recipient: string;
  amount: string;
};

export type PermitData = {
  token: string;
  owner: string;
  spender: string;
  amount: string;
  deadline: string;
  nonce: string;
  signature?: string;
  transferDetails: TransferDetail[];
};

export class PermitHandler {
  public chainId: number;
  public provider: Provider;

  public permit2Module: Contract;

  constructor(chainId: number, provider: Provider) {
    this.chainId = chainId;
    this.provider = provider;
    this.permit2Module = new Contract(
      Addresses.PermitModule[this.chainId],
      PermitModuleAbi,
      provider
    );
  }

  public async getSignatureData(permitTransfer: PermitTransfer, expiresIn = 10 * 60) {
    const { approval } = permitTransfer;
    const token = new Contract(
      approval.currency,
      new Interface([
        `function nonces(address owner) external view returns (uint256)`,
        `function name() external view returns(string)`,
        `function version() external view returns(string)`,
      ]),
      this.provider
    );

    const [nonce, name, version] = await Promise.all([
      token.nonces(approval.owner),
      token.name(),
      token.version(),
    ]);

    const now = getCurrentTimestamp();
    const deadline = now + expiresIn;
    const domain = {
      name: name,
      version: version,
      chainId: this.chainId,
      verifyingContract: approval.currency,
    };

    const values = {
      owner: approval.owner,
      spender: this.permit2Module.address,
      value: approval.amount,
      nonce,
      deadline,
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const transferDetails: TransferDetail[] = [];
    const permit: PermitData = {
      token: approval.currency,
      owner: values.owner,
      spender: values.spender,
      amount: values.value.toString(),
      deadline: values.deadline.toString(),
      nonce: values.nonce.toString(),
      signature: undefined,
      transferDetails: permitTransfer.transferDetails.reduce((all, one) => {
        one.items.forEach((c) => {
          all.push({
            recipient: one.recipient,
            amount: c.amount.toString(),
          });
        });
        return all;
      }, transferDetails),
    };
    return {
      typedData: {
        signatureKind: "eip712",
        domain: domain,
        types: types,
        value: values,
      },
      permit,
    };
  }

  public attachToRouterExecution(txData: TxData, permitTransfer: PermitData): TxData {
    const routerIface = new Interface(RouterAbi);
    const executionInfos = routerIface.decodeFunctionData("execute", txData.data).executionInfos;

    return {
      ...txData,
      data: routerIface.encodeFunctionData("execute", [
        [
          ...[
            {
              module: this.permit2Module.address,
              data: this.permit2Module.interface.encodeFunctionData("transfer", [[permitTransfer]]),
              value: 0,
            },
          ],
          ...executionInfos,
        ],
      ]),
    };
  }
}
