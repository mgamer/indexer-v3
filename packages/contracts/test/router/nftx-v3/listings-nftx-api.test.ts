import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { NFTXV3Listing } from "../helpers/nftx-v3";
import { ExecutionInfo } from "../helpers/router";
import { bn, getChainId, getRandomBoolean, getRandomFloat, reset } from "../../utils";
import { Network } from "@reservoir0x/sdk/src/utils";

describe("[ReservoirV6_0_1] NFTXV3 listings (with NFTX API routing)", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let carol: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let nftxV3Module: Contract;

  beforeEach(async () => {
    [deployer, alice, carol, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxV3Module = await ethers
      .getContractFactory("NFTXV3Module", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.NftxV3.Addresses.MarketplaceZap[chainId]
        )
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        carol: await ethers.provider.getBalance(carol.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxV3Module: await ethers.provider.getBalance(nftxV3Module.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        carol: await contract.getBalance(carol.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxV3Module: await contract.getBalance(nftxV3Module.address),
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
    partial: boolean
  ) => {
    // Setup

    // Token owner = alice
    const owner = "0xfE1AA5275DDa4B333b1fb0Ccbd7A5f14EdC4A5de";
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [owner, "0x1000000000000000000"],
    });
    alice = await ethers.getSigner(owner);

    // Collection = BoredApe
    const collection = "0xD643e0B909867025b50375D7495e7d0f6F85De5f";
    const vault = "0x670b8Ab9196D05A86b3EfD07B10d4fdBf2102532";
    const vaultId = 7;
    const tokensInVault = [3, 4];

    const listings: NFTXV3Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < tokensInVault.length; i++) {
      if (tokensInVault.length < i) {
        break;
      }

      const factory = await ethers.getContractFactory("MockERC721", deployer);
      const erc721 = factory.attach(collection);

      await erc721
        .connect(alice)
        .setApprovalForAll(Sdk.NftxV3.Addresses.MarketplaceZap[Network.EthereumGoerli], true);
      await erc721.connect(alice).setApprovalForAll(router.address, true);
      await erc721.connect(alice).setApprovalForAll(vault, true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listing: any = {
        seller: alice,
        nft: {
          contract: erc721,
          id: tokensInVault[i],
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      };

      const poolPrice = await Sdk.NftxV3.Helpers.getPoolPriceFromAPI(
        vault,
        "buy",
        1000,
        ethers.provider,
        alice.address,
        [listing.nft.id.toString()]
      );

      listing.price = bn(poolPrice.price);
      listing.vault = vault;
      listing.order = new Sdk.NftxV3.Order(chainId, {
        vaultId: vaultId.toString(),
        pool: vault,
        collection: listing.nft.contract.address,
        userAddress: alice.address,
        idsOut: [listing.nft.id.toString()],
        path: [],
        executeCallData: poolPrice.executeCallData,
        deductRoyalty: "false",
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
        module: nftxV3Module.address,
        data: nftxV3Module.interface.encodeFunctionData("buyWithETH", [
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
    if (partial && revertIfIncomplete && listings.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

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
    expect(ethBalancesAfter.nftxV3Module).to.eq(0);
  };

  for (const partial of [false, true]) {
    for (const chargeFees of [false, true]) {
      for (const revertIfIncomplete of [true, false]) {
        const testName =
          "[eth]" +
          `${partial ? "[partial]" : "[full]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}` +
          `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

        it(testName, async () => testAcceptListings(chargeFees, revertIfIncomplete, partial));
      }
    }
  }
});
