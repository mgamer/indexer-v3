// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ISuperRare} from "../../../interfaces/ISuperRare.sol";

// Notes:
// - only supports filling "buy now" listings (ERC721 and ETH-denominated)

contract SuperRareModule is BaseExchangeModule {
  // --- Structs ---

  struct Listing {
    IERC721 token;
    uint256 tokenId;
    address currency;
    uint256 price;
  }

  // --- Fields ---

  ISuperRare public constant BAZAAR = ISuperRare(0x6D7c44773C52D396F43c2D511B81aa168E9a7a42);

  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    Listing calldata listing,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // Execute fill
    _buy(
      listing.token,
      listing.tokenId, 
      listing.currency, 
      params.fillTo, 
      params.revertIfIncomplete, 
      listing.price
    );
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    Listing[] calldata listings,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // Foundation does not support batch filling so we fill orders one by one
    for (uint256 i = 0; i < listings.length; ) {
      _buy(
        listings[i].token,
        listings[i].tokenId,
        listings[i].currency,
        params.fillTo,
        params.revertIfIncomplete,
        listings[i].price
      );

      unchecked {
        ++i;
      }
    }
  }

  // --- ERC721 hooks ---

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata // data
  ) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }

  // --- Internal ---

  function _buy(
    IERC721 token,
    uint256 tokenId,
    address currency,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    // Execute fill
    try BAZAAR.buy{value: value}(token, tokenId, currency, value) {
      token.safeTransferFrom(address(this), receiver, tokenId);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
