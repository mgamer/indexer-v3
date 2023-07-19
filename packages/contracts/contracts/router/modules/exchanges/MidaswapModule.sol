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
    address midasRouter,
    IWETH _weth
  ) BaseModule(owner) BaseExchangeModule(router) {
    MIDAS_ROUTER = IMidasRouter(midasRouter);
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
      _buyItemWithETH(nfts[i], address(weth), params.fillTo, nftIds[i], params.revertIfIncomplete);
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
    uint256 _length = nfts.length;
    for (uint i; i < _length; ) {
      // Execute fill
      _buyItem(nfts[i], address(params.token), params.fillTo, nftIds[i], params.revertIfIncomplete);
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
    // _approveERC721IfNeeded(IERC721(nft), address(this));

    // Execute fill
    if (token == 0x0000000000000000000000000000000000000000) {
      _sellItemToETH(nft, address(weth), nftId, params.revertIfIncomplete);
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendETH(fee.recipient, fee.amount);
        unchecked {
          ++i;
        }
      }
      _sendAllETH(params.fillTo);
    } else {
      _sellItem(nft, token, address(this), nftId, params.revertIfIncomplete);
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, IERC20(token));
        unchecked {
          ++i;
        }
      }
      _sendAllERC20(params.fillTo, IERC20(token));
    }
    // Refund any leftovers
    _sendAllERC721(params.refundTo, IERC721(nft), nftId);
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

  function _buyItemWithETH(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256 _tokenId,
    bool revertIfIncomplete
  ) internal {
    require(_tokenY == address(weth));
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = _tokenId;
    uint256 _ftAmount = MIDAS_ROUTER.getMinAmountIn(_pair, tokenIds);
    _wethDepositAndTransfer(_pair, _ftAmount);
    // Execute the fill
    try IMidasPair(_pair).buyNFT(_tokenId, _to) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _buyItem(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256 _tokenId,
    bool revertIfIncomplete
  ) internal {
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = _tokenId;
    uint256 _ftAmount = MIDAS_ROUTER.getMinAmountIn(_pair, tokenIds);
    IERC20(_tokenY).transferFrom(address(this), _pair, _ftAmount);
    // Execute the fill
    try IMidasPair(_pair).buyNFT(_tokenId, _to) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _sellItemToETH(
    address _tokenX,
    address _tokenY,
    uint256 _tokenId,
    bool revertIfIncomplete
  ) internal {
    require(_tokenY == address(weth));
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    IERC721(_tokenX).safeTransferFrom(address(this), _pair, _tokenId);
    // Execute the fill
    try IMidasPair(_pair).sellNFT(_tokenId, address(this)) returns (uint128 ftAmount) {
      uint256 _ftAmount = ftAmount;
      // Unwrap the WETH
      weth.withdraw(_ftAmount);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _sellItem(
    address _tokenX,
    address _tokenY,
    address _to,
    uint256 _tokenId,
    bool revertIfIncomplete
  ) internal {
    address _pair;
    _pair = MIDAS_FACTORY.getPairERC721(_tokenX, _tokenY);
    IERC721(_tokenX).safeTransferFrom(address(this), _pair, _tokenId);
    // Execute the fill
    try IMidasPair(_pair).sellNFT(_tokenId, _to) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _wethDepositAndTransfer(address _to, uint256 _amount) private {
    weth.deposit{value: _amount}();
    weth.transfer(_to, _amount);
  }
}
