// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IMidasRouter {
    function getMinAmountIn(
        address _pair,
        uint256[] calldata _tokenIds
    ) external view returns (uint128 totalAmount);
}

interface IMidasPair {
    event SellNFT(
        uint256 indexed nftTokenId,
        address indexed from,
        uint24 tradeBin,
        uint128 indexed lpTokenID
    );

    event BuyNFT(
        uint256 indexed nftTokenId,
        address indexed from,
        uint24 tradeBin,
        uint128 indexed lpTokenID
    );

    function sellNFT(
        uint256 NFTID,
        address _to
    ) external returns (uint128 _amountOut);

    function buyNFT(uint256 NFTID, address _to) external;
}

interface IMidasFactory {
    function getPairERC721(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}