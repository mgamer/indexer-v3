import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { NFTXListing, setupNFTXListings } from "../helpers/nftx";
import { ExecutionInfo } from "../helpers/router";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../../utils";

describe("[ReservoirV6_0_0] NFTX-ZeroEx listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let nftxModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;

      // NFTXModule
      // NFTXZeroExModule
    nftxModule = (await ethers

      .getContractFactory("NFTXZeroExModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Eth[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxModule: await ethers.provider.getBalance(nftxModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxModule: await contract.getBalance(nftxModule.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of listings to fill
    listingsCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    // Holder
    const mockAddress = `0xc8c9771b59f9f217e8285889b9cdd7b9ddce0e86`;
    // Milady
    const mockCollection = '0x5af0d9827e0c53e4799bb226655a1de152a425a5';
    const vaultAddress = '0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48';
    const _vaultId = 392;
    alice = await ethers.getSigner(mockAddress);

    // in vault
    const holdTokenIds = [
      523,
      592
    ]

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [mockAddress, "0x1000000000000000000"],
    });

    let listings: NFTXListing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {

      if (holdTokenIds.length < i) {
        break;
      }

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [mockAddress],
      });

      const factory = await ethers.getContractFactory("MockERC721", deployer);
      const erc721 = await factory.attach(mockCollection);

      const listing: any = {
        seller: alice,
        nft: {
          contract: erc721,
          id: holdTokenIds[i],
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      }

      const poolPrice = await Sdk.Nftx.Helpers.getPoolPriceFrom0x(
        vaultAddress,
        1,
        "buy",
        1000,
        ethers.provider
      );
      listing.price = bn(poolPrice.price);
      listing.vault = vaultAddress;
      listing.order = new Sdk.Nftx.Order(chainId, {
        vaultId: _vaultId.toString(),
        collection: listing.nft.contract.address,
        pool: vaultAddress,
        specificIds: [listing.nft.id.toString()],
        amount: "1",
        path: [Sdk.Common.Addresses.Weth[chainId], vaultAddress],
        swapCallData: poolPrice.swapCallData,
        price: listing.isCancelled ? "0" : listing.price.toString(),
        extra: {
          prices: [listing.price.toString()],
        },
      });

      listings.push(listing);

      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

    // Prepare executions
    const totalPrice = bn(
      listings
        .map(({ price }) =>
          // The protocol fee should be paid on top of the price
          bn(price).add(bn(price).mul(50).div(10000))
        )
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      {
        module: nftxModule.address,
        data: nftxModule.interface.encodeFunctionData("buyWithETH", [
          listings.map((listing) => listing.order!.params),
          {
            fillTo: carol.address,
            refundTo: carol.address,
            revertIfIncomplete,
            amount: totalPrice,
          },
          [
            ...feesOnTop.map((amount) => ({
              recipient: emilio.address,
              amount,
            })),
          ],
        ]),
        value: totalPrice.add(
          // Anything on top should be refunded
          feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
        ),
      },
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (
      partial &&
      revertIfIncomplete &&
      listings.some(({ isCancelled }) => isCancelled)
    ) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions
            .map(({ value }) => value)
            .reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith(
        "reverted with custom error 'UnsuccessfulExecution()'"
      );

      return;
    }

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );

    // Execute

    await router.connect(carol).execute(executions, {
      gasLimit: 30000000,
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );

    const aliceOrderList = listings.filter(
      ({ seller, isCancelled }) =>
        !isCancelled && seller.address === alice.address
    );

    const aliceOrderSum = aliceOrderList
      .map(({ price }) => bn(price))
      .reduce((a, b) => bn(a).add(b), bn(0));

    const bobOrderList = listings.filter(
      ({ seller, isCancelled }) =>
        !isCancelled && seller.address === bob.address
    );

    const bobOrderSum = bobOrderList
      .map(({ price }) => bn(price))
      .reduce((a, b) => bn(a).add(b), bn(0));

    // Checks
    const emilioBalance = ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio);
    const carloSpend = ethBalancesBefore.carol.sub(ethBalancesAfter.carol);

    const orderSum = aliceOrderSum.add(bobOrderSum);
    const diffPercent =
      (parseFloat(formatEther(orderSum.sub(carloSpend))) /
        parseFloat(formatEther(carloSpend))) *
      100;

    // Check Carol balance
    const defaultSlippage = 5;
    // expect(diffPercent).to.lte(defaultSlippage);

    // const pairBalancesAfter = await getPairBalances();
    // const lpFee = 281; // 281 / 10000

    // for (let index = 0; index < listings.length; index++) {
    //   const listing = listings[index];
    //   if (listing.isCancelled) continue;
    //   if (listing.lpToken) {
    //     const before = pairBalancesBefore.find(
    //       (c) => c.pair === listing.lpToken
    //     );
    //     const after = pairBalancesAfter.find((c) => c.pair === listing.lpToken);
    //     if (before && after) {
    //       const change = parseEther(after.balance).sub(
    //         parseEther(before.balance)
    //       );
    //       const diffPercent = bn(listing.price)
    //         .sub(change)
    //         .mul(bn(10000))
    //         .div(listing.price);
    //       // Check pair balance change
    //       expect(diffPercent).to.eq(bn(lpFee));
    //     }
    //   }
    // }

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0));

      const chargeFeeSum = listings
        .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
        .reduce((a, b) => bn(a).add(b), bn(0));

      // expect(emilioBalance).to.gte(chargeFeeSum);
    }

    // Carol got the NFTs from all filled orders
    for (let i = 0; i < listings.length; i++) {
      const nft = listings[i].nft;
      if (!listings[i].isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].vault);
      }
    }

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.nftxModule).to.eq(0);
  };

  it("Fill listing", async () =>
    testAcceptListings(
      true,
      true,
      false,
      1
    )
  );
});
