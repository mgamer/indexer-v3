// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniswapV3Router} from "../../../interfaces/IUniswapV3Router.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract Swap1inchModule is BaseExchangeModule {
  struct TransferDetail {
    address recipient;
    uint256 amount;
    bool toETH;
  }

  struct SwapDetail {
    IERC20 tokenIn;
    IERC20 tokenOut;
    uint256 amountOut;
    uint256 amountInMaximum;
    bytes data;
  }

  struct Swap {
    SwapDetail params;
    TransferDetail[] transfers;
  }

  // --- Fields ---

  IWETH public immutable WETH;
  address public immutable SWAP_ROUTER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address weth,
    address swapRouter
  ) BaseModule(owner) BaseExchangeModule(router) {
    WETH = IWETH(weth);
    SWAP_ROUTER = swapRouter;
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Swaps ---
  function erc20ToExactOutput(
    Swap calldata swap,
    address refundTo
  ) external nonReentrant refundERC20Leftover(refundTo, swap.params.tokenIn) {
    // Approve the router if needed
    _approveERC20IfNeeded(swap.params.tokenIn, SWAP_ROUTER, swap.params.amountInMaximum);

    // Execute the swap
    _makeCall(SWAP_ROUTER, swap.params.data, 0);

    uint256 length = swap.transfers.length;
    for (uint256 i = 0; i < length; ) {
      TransferDetail calldata transferDetail = swap.transfers[i];
      if (transferDetail.toETH) {
        WETH.withdraw(transferDetail.amount);
        _sendETH(transferDetail.recipient, transferDetail.amount);
      } else {
        _sendERC20(transferDetail.recipient, transferDetail.amount, IERC20(swap.params.tokenOut));
      }

      unchecked {
        ++i;
      }
    }
  }
}
