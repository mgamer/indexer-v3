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
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount)
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
        // buy punks
        try
            PUNK_MARKETPLACE.buyPunk{value: buyOrder.price}(
                buyOrder.punkIndex
            )
        {
            // transfer the punk back to receiver
            PUNK_MARKETPLACE.transferPunk(buyer, buyOrder.punkIndex);
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        } 
        
    }
    
}