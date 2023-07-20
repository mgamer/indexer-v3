import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId } from "../../utils";

import FactoryAbi from "@reservoir0x/sdk/src/midaswap/abis/Factory.json";
import RouterAbi from "@reservoir0x/sdk/src/midaswap/abis/Router.json";

const deadline = Date.now() + 100 * 24 * 60 * 60 * 1000;

// --- Listings ---
export type MidaswapListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  bin: number;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Midaswap.Order;
  lpInfo: {
    lpAddress: string;
    lpTokenId: number;
    pairAddress: string;
  };
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
    const { seller, nft, price, bin } = listing;

    // Approve the factory contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.Midaswap.Addresses.Router[chainId], true);

    let pair = await factory
      .connect(seller)
      .getPairERC721(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
    let lpTokenAddress = await factory?.getLPTokenERC721(
      nft.contract.address,
      Sdk.Common.Addresses.Weth[chainId]
    );
    if (pair === "0x0000000000000000000000000000000000000000") {
      // Get the pair address by making a static call to the deploy method
      const tempPair = await factory
        .connect(seller)
        .callStatic.createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
      pair = tempPair.pair;
      // console.log(JSON.stringify(pair));
      lpTokenAddress = tempPair.lpToken;
      // Actually create the pair
      await factory
        .connect(seller)
        .createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
    }

    // Actually deploy to pool
    const addTx = await router.connect(seller).addLiquidityERC721(
      nft.contract.address,
      Sdk.Common.Addresses.Weth[chainId],
      [bin],
      [nft.id],
      (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 * 1000) * 2 // deadline
    );

    const addTxDetail = await addTx.wait();
    const topics = addTxDetail.logs[addTxDetail.logs.length - 1].topics;
    const lptokenId = Number(topics[topics.length - 1]);
    listing.lpInfo = {
      lpAddress: lpTokenAddress,
      lpTokenId: lptokenId,
      pairAddress: pair,
    };
    listing.order = new Sdk.Midaswap.Order(chainId, {
      pair: pair,
      tokenX: nft.contract.address,
      tokenY: Sdk.Common.Addresses.Weth[chainId],
      lpTokenId: lptokenId.toString(),
      extra: {
        prices: [
          {
            price: price.toString(),
            bin: bin.toString(),
            lpTokenId: lptokenId.toString(),
          },
        ],
      },
    });
  }
};

// --- Offers ---

export type MidaswapOffer = {
  buyer: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  bin: number;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Midaswap.Order;
  lpInfo?: {
    lpAddress: string;
    lpTokenId: number;
    pairAddress: string;
  };
};

export const setupMidaswapOffers = async (offers: MidaswapOffer[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.Midaswap.Addresses.PairFactory[chainId],
    FactoryAbi,
    ethers.provider
  );
  const router = new Contract(Sdk.Midaswap.Addresses.Router[chainId], RouterAbi, ethers.provider);

  for (const listing of offers) {
    const { buyer, nft, price, bin } = listing;

    let pair = await factory
      .connect(buyer)
      .getPairERC721(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
    let lpTokenAddress = await factory?.getLPTokenERC721(
      nft.contract.address,
      Sdk.Common.Addresses.Weth[chainId]
    );
    if (pair === "0x0000000000000000000000000000000000000000") {
      // Get the pair address by making a static call to the deploy method
      const tempPair = await factory
        .connect(buyer)
        .callStatic.createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
      pair = tempPair.pair;
      // console.log(JSON.stringify(pair));
      lpTokenAddress = tempPair.lpToken;
      // Actually create the pair
      await factory
        .connect(buyer)
        .createERC721Pair(nft.contract.address, Sdk.Common.Addresses.Weth[chainId]);
    }

    // Actually deploy to pool
    const addTx = await router
      .connect(buyer)
      .addLiquidityETH(nft.contract.address, Sdk.Common.Addresses.Weth[chainId], [bin], deadline, {
        value: price,
      });

    const addTxDetail = await addTx.wait();
    const topics = addTxDetail.logs.filter(
      (item: { address: string }) => item?.address === lpTokenAddress
    )?.[0]?.topics;
    const lptokenId = Number(topics[topics.length - 1]);
    listing.lpInfo = {
      lpAddress: lpTokenAddress,
      lpTokenId: lptokenId,
      pairAddress: pair,
    };
    listing.order = new Sdk.Midaswap.Order(chainId, {
      pair: pair,
      tokenX: nft.contract.address,
      tokenY: Sdk.Common.Addresses.Weth[chainId],
      lpTokenId: lptokenId.toString(),
      extra: {
        prices: [
          {
            price: price.toString(),
            bin: bin.toString(),
            lpTokenId: lptokenId.toString(),
          },
        ],
      },
    });
  }
};
