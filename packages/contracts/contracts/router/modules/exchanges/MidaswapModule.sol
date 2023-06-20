// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";
import {IMidasRouter} from "../../../interfaces/IMidaswap.sol";
import {IMidasPair} from "../../../interfaces/IMidaswap.sol";
import {IMidasFactory} from "../../../interfaces/IMidaswap.sol";

contract MidaswapModule is BaseExchangeModule {
  IWETH public weth;
  IMidasRouter public immutable MIDAS_ROUTER;
  IMidasFactory public immutable MIDAS_FACTORY;

  // --- Constructor ---
  constructor(
    address owner,
    address router,
    address factory,
    IWETH _weth
  ) BaseModule(owner) BaseExchangeModule(router) {
    MIDAS_ROUTER = IMidasRouter(router);
    MIDAS_FACTORY = IMidasFactory(factory);
    weth = _weth;
  }

  // --- Fallback ---
  receive() external payable {
    assert(msg.sender == address(weth)); // only accept ETH via fallback from the WETH contract
  }

  // --- Multiple ETH listings ---

  function buyWithETH(
    address[] calldata nfts,
    uint256[] calldata nftIds,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 _length = nfts.length;
    for (uint i; i < _length; ) {
      // Execute fill
      _buyItemsWithETH(nfts[i], address(weth), params.fillTo, nftIds[i]);
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
      unchecked {
        ++i;
      }
    }
  }

  // --- Multiple ERC20 listings ---

  function buyWithERC20(
    address[] calldata nfts,
    uint256[] calldata nftIds,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the router if needed
    // _approveERC20IfNeeded(params.token, address(this), params.amount);
    uint256 _length = nfts.length;
    for (uint i; i < _length; ) {
      // Execute fill
      _buyItems(nfts[i], address(params.token), params.fillTo, nftIds[i]);
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
      unchecked {
        ++i;
      }
    }
  }

  // --- Single offer ---
  function sell(
    address nft,
    address token,
    uint256 nftId,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    // Approve the router if needed
    _approveERC721IfNeeded(IERC721(nft), address(this));

    // Build router data
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = nftId;

    // Execute fill
    if (token == 0x0000000000000000000000000000000000000000) {
      _sellItemsToETH(nft, address(weth), params.fillTo, tokenIds);
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendETH(fee.recipient, fee.amount);
        unchecked {
          ++i;
        }
      }
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    } else {
      _sellItems(nft, token, params.fillTo, tokenIds);
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 i; i < feesLength; ) {
          Fee memory fee = fees[i];
          _sendERC20(fee.recipient, fee.amount, IERC20(token));
          unchecked {
            ++i;
          }
        }
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
      // Refund any leftovers
      _sendAllERC721(params.refundTo, IERC721(nft), nftId);
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

  // --- Internal ---
  function _buyItemsWithETH(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256 _tokenId
  ) internal {
    require(_tokenY == address(weth));
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = _tokenId;
    uint256 _ftAmount = MIDAS_ROUTER.getMinAmountIn(_pair, tokenIds);
    _wethDepositAndTransfer(_pair, _ftAmount);
    IMidasPair(_pair).buyNFT(_tokenId, _to);
  }

  function _buyItems(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256 _tokenId
  ) internal {
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = _tokenId;
    uint256 _ftAmount = MIDAS_ROUTER.getMinAmountIn(_pair, tokenIds);
    IERC20(_tokenY).transferFrom(_to, _pair, _ftAmount);
    IMidasPair(_pair).buyNFT(_tokenId, _to);
  }

  function _sellItemsToETH(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256[] memory _tokenIds
  ) internal {
    require(_tokenY == address(weth));
    address _pair;
    uint256 _length;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    _length = _tokenIds.length;
    for (uint256 i; i < _length; ) {
      IERC721(_tokenX).safeTransferFrom(_to, _pair, _tokenIds[i]);
      uint256 _ftAmount = IMidasPair(_pair).sellNFT(_tokenIds[i], address(this));
      weth.withdraw(_ftAmount);
      _safeTransferETH(_to, _ftAmount);
      unchecked {
        ++i;
      }
    }
  }

  function _sellItems(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256[] memory _tokenIds
  ) internal {
    address _pair;
    uint256 _length;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    _length = _tokenIds.length;
    for (uint256 i; i < _length; ) {
      IERC721(_tokenX).safeTransferFrom(_to, _pair, _tokenIds[i]);
      IMidasPair(_pair).sellNFT(_tokenIds[i], _to);
      unchecked {
        ++i;
      }
    }
  }

  function _safeTransferETH(address _to, uint256 _amount) private {
    (bool success, ) = _to.call{value: _amount}("");
    require(success == true);
  }

  function _wethDepositAndTransfer(address _to, uint256 _amount) private {
    weth.deposit{value: _amount}();
    weth.transfer(_to, _amount);
  }
}
