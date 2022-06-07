import { Common } from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import * as ftApprovalsModel from "@/models/ft-approvals";

export const fetchAndUpdateFtApproval = async (token: string, owner: string, spender: string) => {
  const erc20 = new Common.Helpers.Erc20(baseProvider, token);
  const allowance = await erc20.getAllowance(owner, spender).then((b) => b.toString());
  return ftApprovalsModel.saveFtApproval({
    token,
    owner,
    spender,
    value: allowance,
  });
};
