// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniswapV3Router} from "../../../interfaces/IUniswapV3Router.sol";
import {IERC20Permit} from "../../../interfaces/IERC20Permit.sol";

// Notes:
// - transfer ERC20 token via gasless permit signature

contract PermitModule is BaseExchangeModule {

  struct TransferDetail {
    address recipient;
    uint256 amount;
  }

  struct PermitTransfer {
    address token;
    address owner;
    address spender;
    uint256 amount;
    uint256 deadline;
    bytes signature;
    TransferDetail[] transferDetails;
  }

  // --- Constructor ---
  constructor(
    address owner,
    address router
  ) BaseModule(owner) BaseExchangeModule(router) {
  }

  function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
    require(sig.length == 65, "invalid signature length");
    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := byte(0, mload(add(sig, 96)))
    }
  }

  // --- Wrap ---
  function transfer(PermitTransfer[] calldata transfers) external payable nonReentrant {
    uint256 length = transfers.length;
    for (uint256 i = 0; i < length; ) {
      PermitTransfer memory transfer = transfers[i];
      (bytes32 r, bytes32 s, uint8 v) = splitSignature(transfer.signature);
      IERC20Permit(transfers[i].token).permit(
        transfer.owner,
        transfer.spender,
        transfer.amount,
        transfer.deadline,
        v,
        r,
        s
      );
      uint256 tLength = transfer.transferDetails.length;
      IERC20 token = IERC20(transfer.token);
      for (uint256 c = 0; c < tLength; ) {
        token.transferFrom(
          transfer.owner, 
          transfer.transferDetails[c].recipient, 
          transfer.transferDetails[c].amount
        );
        unchecked {
          ++c;
        }
      }
      unchecked {
        ++i;
      }
    }
  }
}
