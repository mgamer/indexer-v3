// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ISudoswapPairV2 } from "../../../interfaces/ISudoswapV2.sol";

contract SudoswapV2Module is BaseExchangeModule {
  // --- Constructor ---

  constructor(
    address owner,
    address router
  ) BaseModule(owner) BaseExchangeModule(router) {

  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    ISudoswapPairV2[] calldata pairs,
    uint256[] calldata nftIds,
    uint256 deadline,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 pairsLength = pairs.length;
    for (uint256 i; i < pairsLength; ) {
      // Fetch the current price quote
      (, , , uint256 price, uint256 protocolFee, uint256 royaltyAmount) = pairs[i].getBuyNFTQuote(nftIds[i], 1);
      uint256[] memory tokenIds = new uint256[](1);
      tokenIds[0] = nftIds[i];

      // Execute fill
      try
        pairs[i].swapTokenForSpecificNFTs{value: price}(
          tokenIds,
          price,
          params.fillTo,
          false,
          address(0)
        )
      {} catch {
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  // --- Multiple ERC20 listings ---

  function buyWithERC20(
    ISudoswapPairV2[] calldata pairs,
    uint256[] calldata nftIds,
    uint256 deadline,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
   
    uint256 pairsLength = pairs.length;
    for (uint256 i; i < pairsLength; ) {
      // Fetch the current price quote
      (, , , uint256 price, uint256 protocolFee, uint256 royaltyAmount) = pairs[i].getBuyNFTQuote(nftIds[i], 1);
      uint256[] memory tokenIds = new uint256[](1);
      tokenIds[0] = nftIds[i];

      // Approve the router if needed
      _approveERC20IfNeeded(params.token, address(pairs[i]), params.amount);

      // Execute fill
      try
        pairs[i].swapTokenForSpecificNFTs(
          tokenIds,
          price,
          params.fillTo,
          false,
          address(0)
        )
      {} catch {
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  function isERC1155Pair(ISudoswapPairV2 pair) private returns(bool) {
    ISudoswapPairV2.PairVariant vaiant = pair.pairVariant();
    return ISudoswapPairV2.PairVariant.ERC1155_ERC20 == vaiant || ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }

  function isETHPair(ISudoswapPairV2 pair) private returns(bool) {
    ISudoswapPairV2.PairVariant vaiant = pair.pairVariant();
    return ISudoswapPairV2.PairVariant.ERC721_ETH == vaiant || ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }

  // --- Single offer ---

  function sell(
    ISudoswapPairV2 pair,
    uint256 nftId,
    uint256 minOutput,
    uint256 deadline,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    // Approve the router if needed
    if (isERC1155Pair(pair)) {
      _approveERC1155IfNeeded(IERC1155(pair.nft()), address(pair));
    } else {
      _approveERC721IfNeeded(IERC721(pair.nft()), address(pair));
    }
   
    // Build router data
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = nftId;

    // Execute fill
    try pair.swapNFTsForToken(tokenIds, minOutput, payable(address(this)), false, address(0)) {
      bool isETH = isETHPair(pair);

      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        isETH
          ? _sendETH(fee.recipient, fee.amount)
          : _sendERC20(fee.recipient, fee.amount, pair.token());

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      isETH ? _sendAllETH(params.fillTo) : _sendAllERC20(params.fillTo, pair.token());
    } catch {
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    if (!isERC1155Pair(pair)) {
      // Refund any ERC721 leftover
      _sendAllERC721(params.refundTo, IERC721(pair.nft()), nftId);
    } else {
      // Refund any ERC1155 leftover
      _sendAllERC1155(params.refundTo, IERC1155(pair.nft()), pair.nftId());
    }
  }

  // --- ERC721 hooks ---

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC721Received.selector;
  }
  
  function onERC1155Received(
    address, // operator
    address, // from
    uint256, // tokenId
    uint256, // amount
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC1155Received.selector;
  }
}
