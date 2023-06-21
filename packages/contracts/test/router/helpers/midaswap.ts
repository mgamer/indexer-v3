import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { bn, getChainId } from "../../utils";

import FactoryAbi from "@reservoir0x/sdk/src/midaswap/abis/Factory.json";
import RouterAbi from "@reservoir0x/sdk/src/midaswap/abis/Router.json";

// --- Listings ---
export type MidaswapListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Midaswap.Order;
};

export const setupMidaswapListings = async (listings: MidaswapListing[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.Midaswap.Addresses.PairFactory[chainId],
    FactoryAbi,
    ethers.provider
  );

  const router = new Contract(Sdk.Midaswap.Addresses.Router[chainId], RouterAbi, ethers.provider);

  for (const listing of listings) {
    const { seller, nft, price, isCancelled } = listing;

    // Approve the factory contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.Midaswap.Addresses.Router[chainId], true);

    // Get the pair address by making a static call to the deploy method
    const pair = await factory
      .connect(seller)
      .callStatic.createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);

    // console.log(JSON.stringify(pair));

    // Actually create the pair
    await factory
      .connect(seller)
      .createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);

    // Actually deploy to pool
    const addTx = await router.connect(seller).addLiquidityERC721(
      nft.contract.address,
      Sdk.Common.Addresses.Weth[chainId],
      [8296500], // bins
      [nft.id],
      (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 * 1000) * 2 // deadline
    );

    await addTx.wait();
    console.log(pair[1], addTx.hash, "addLiquidityERC721");

    listing.order = new Sdk.Midaswap.Order(chainId, {
      pair: pair[1],
      tokenX: nft.contract.address,
      extra: {
        prices: [price.toString()],
      },
    });
  }
};

// --- Offers ---

// export type MidaswapOffer = {
//   buyer: SignerWithAddress;
//   nft: {
//     contract: Contract;
//     id: number;
//   };
//   price: BigNumberish;
//   // Whether the order is to be cancelled
//   isCancelled?: boolean;
//   order?: Sdk.Midaswap.Order;
// };

// export const setupMidaswapOffers = async (offers: MidaswapOffer[]) => {
//   const chainId = getChainId();

//   const factory = new Contract(
//     Sdk.Midaswap.Addresses.PairFactory[chainId],
//     FactoryAbi,
//     ethers.provider
//   );
//   for (const offer of offers) {
//     const { buyer, nft, price, isCancelled } = offer;

//     // Get the pair address by making a static call to the deploy method
//     const pair = await factory.connect(buyer).callStatic.createPairERC721ETH(
//       nft.contract.address,
//       Sdk.Midaswap.Addresses.LinearCurve[chainId],
//       buyer.address,
//       0, // TOKEN
//       0,
//       0,
//       price,
//       AddressZero,
//       [],
//       { value: isCancelled ? bn(0) : price }
//     );

//     // Actually deploy the pair
//     await factory.connect(buyer).createPairERC721ETH(
//       nft.contract.address,
//       Sdk.Midaswap.Addresses.LinearCurve[chainId],
//       buyer.address,
//       0, // TOKEN
//       0,
//       0,
//       price,
//       AddressZero,
//       [],
//       { value: isCancelled ? bn(0) : price }
//     );

//     offer.order = new Sdk.Midaswap.Order(chainId, {
//       pair,
//       extra: {
//         prices: [price.toString()],
//       },
//     });
//   }
// };
