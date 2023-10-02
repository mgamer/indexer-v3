import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { NFTXV3Offer } from "../helpers/nftx-v3";
import { ExecutionInfo } from "../helpers/router";
import { bn, getChainId, getRandomBoolean, getRandomFloat, reset } from "../../utils";
import { Network } from "@reservoir0x/sdk/src/utils";

describe("[ReservoirV6_0_1] NFTX offers (with NFTX API routing)", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let nftxV3Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxV3Module = await ethers
      .getContractFactory("NFTXV3Module", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address, Sdk.NftxV3.Addresses.MarketplaceZap[chainId])
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxV3Module: await ethers.provider.getBalance(nftxV3Module.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxV3Module: await contract.getBalance(nftxV3Module.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptOffers = async (
    // Whether to charge fees on the received amount
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
    carol = await ethers.getSigner(owner);

    // Collection = milady
    const collection = "0xD643e0B909867025b50375D7495e7d0f6F85De5f";
    const vault = "0x670b8Ab9196D05A86b3EfD07B10d4fdBf2102532";
    const vaultId = 7;
    const tokensInVault = [3, 4];
    const tokenId = 121;

    const factory = await ethers.getContractFactory("MockERC721", deployer);

    const offers: NFTXV3Offer[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < tokensInVault.length; i++) {
      const erc721 = factory.attach(collection);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer: any = {
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: tokensInVault[i],
        },
        price: parseEther(getRandomFloat(0.6, 5).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      };

      const poolPrice = await Sdk.NftxV3.Helpers.getPoolPriceFromAPI(
        vault,
        "sell",
        100,
        ethers.provider,
        carol.address,
        [offer.nft.id.toString()]
      );

      if (poolPrice.price) {
        offer.price = bn(poolPrice.price);
        offer.vault = vault;
        offer.order = new Sdk.NftxV3.Order(chainId, {
          vaultId: vaultId.toString(),
          pool: vault,
          collection: offer.nft.contract.address,
          userAddress: carol.address,
          currency: Sdk.Common.Addresses.Native[chainId],
          idsIn: [offer.nft.id.toString()],
          price: offer.isCancelled ? offer.price.mul(bn(10)).toString() : offer.price.toString(),
          extra: {
            prices: [offer.price.toString()],
          },
          executeCallData: poolPrice.executeCallData,
          deductRoyalty: "false",
          path: [],
        });
      }

      offers.push(offer);

      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }

    const erc721 = factory.attach(collection);
    await erc721.connect(carol).transferFrom(carol.address, nftxV3Module.address, tokenId);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      ...offers
        .filter((_) => _.order)
        .map((offer, i) => ({
          module: nftxV3Module.address,
          data: nftxV3Module.interface.encodeFunctionData("sell", [
            [offer.order?.params],
            {
              fillTo: carol.address,
              refundTo: carol.address,
              revertIfIncomplete,
            },
            [
              ...fees[i].map((amount) => ({
                recipient: emilio.address,
                amount,
              })),
            ],
          ]),
          value: 0,
        })),
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && offers.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute
    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state
    const balancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Carol got the payment
    const orderFee = offers
      .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
      .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
      .reduce((a, b) => bn(a).add(b), bn(0));

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(orderFee);
    }

    // Alice and Bob got the NFTs of the filled orders
    for (const { nft, isCancelled, vault } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(vault);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.nftxV3Module).to.eq(0);
  };

  for (const partial of [false, true]) {
    for (const chargeFees of [false, true]) {
      for (const revertIfIncomplete of [false, true]) {
        const testCaseName =
          `${partial ? "[partial]" : "[full]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}` +
          `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

        it(testCaseName, async () => testAcceptOffers(chargeFees, revertIfIncomplete, partial));
      }
    }
  }
});
