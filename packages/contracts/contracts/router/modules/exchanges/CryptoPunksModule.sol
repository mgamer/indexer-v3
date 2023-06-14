// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {ICryptoPunksMarket} from "../../../interfaces/ICryptoPunksMarket.sol";
import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

contract CryptopunkModule is BaseExchangeModule {

    // --- Fields ---

    ICryptoPunksMarket public immutable PUNK_MARKETPLACE;

    // --- Constructor ---

    constructor(
        address owner,
        address router,
        address punkMarketplace
    ) BaseModule(owner) BaseExchangeModule(router) {
        PUNK_MARKETPLACE = ICryptoPunksMarket(punkMarketplace);
    }

    // --- Fallback ---

    receive() external payable {}

    // --- Multiple buy Punks ---

    function batchBuyPunksWithETH(
        ICryptoPunksMarket.BuyOrder[] calldata buyOrders,
        ETHListingParams calldata params
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
    {
        uint256 length = buyOrders.length;
        for (uint256 i = 0; i < length; ) {
            // Execute fill
            _buy(buyOrders[i], buyOrders[i].buyer, params.revertIfIncomplete);

            unchecked {
                ++i;
            }
        }
    }

    function _buy(
        ICryptoPunksMarket.BuyOrder calldata buyOrder,
        address buyer,
        bool revertIfIncomplete
    ) internal {
        // get ETH from buyer
        require(address(this).balance >= buyOrder.price, "invalid balance");

        // buy punks
        try
            PUNK_MARKETPLACE.buyPunk{value: buyOrder.price}(
                buyOrder.punkIndex
            )
        {} catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        } 

        // transfer the punk back to receiver
        try 
            PUNK_MARKETPLACE.transferPunk(
                buyer, buyOrder.punkIndex
            ) 
        {} catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }

    // --- Multiple sell Punks ---

    function batchSellPunks(
        ICryptoPunksMarket.SellOrder[] calldata sellOrders,
        OfferParams calldata params 
    ) external nonReentrant {
        uint256 length = sellOrders.length;
        for (uint256 i = 0; i < length; ) {
            // Execute sell
            _sell(sellOrders[i], sellOrders[i].seller, params.revertIfIncomplete);

            unchecked {
                ++i;
            }
        }
    }

    function _sell(
        ICryptoPunksMarket.SellOrder calldata sellOrder,
        address seller,
        bool revertIfIncomplete
    ) internal {
        // check if already have the punk from seller
        require(
            PUNK_MARKETPLACE.punkIndexToAddress(sellOrder.punkIndex) == address(this),
            "insufficient punks"
        );

        // accept offers
        try
            PUNK_MARKETPLACE.acceptBidForPunk(
                sellOrder.punkIndex, 
                sellOrder.price
            )
        {} catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }

        // withdraw ETH
        try
            PUNK_MARKETPLACE.withdraw()
        {} catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }

        // transfer ETH back to seller
        (bool success,) = payable(seller).call{value: sellOrder.price}("");
        if (!success) {
            // Copy revert reasons from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }
    
}