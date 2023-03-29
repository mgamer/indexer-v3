// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {BaseModule} from "./BaseModule.sol";
import {IAllowanceTransfer} from "../../interfaces/IAllowanceTransfer.sol";

contract Permit2Module is BaseModule {
  // --- Fields ---

  IAllowanceTransfer public immutable PERMIT2;

  // --- Constructor ---

  constructor(address owner, address permit2) BaseModule(owner) {
    PERMIT2 = IAllowanceTransfer(permit2);
  }

  function permitTransfer(
    address owner,
    IAllowanceTransfer.PermitBatch calldata permitBatch,
    IAllowanceTransfer.AllowanceTransferDetails[] calldata transferDetails,
    bytes calldata signature
  ) external nonReentrant {
    if (owner != tx.origin) {
      revert Unauthorized();
    }

    PERMIT2.permit(owner, permitBatch, signature);
    PERMIT2.transferFrom(transferDetails);
  }
}
