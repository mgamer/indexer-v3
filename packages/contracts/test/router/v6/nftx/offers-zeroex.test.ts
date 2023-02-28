import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { NFTXOffer } from "../helpers/nftx";
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

describe("[ReservoirV6_0_0] NFTX-ZeroEx offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let seaportApprovalOrderZone: Contract;
  let seaportModule: Contract;
  let nftxModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportApprovalOrderZone = (await ethers
      .getContractFactory("SeaportApprovalOrderZone", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportModule = (await ethers
      .getContractFactory("SeaportModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
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
        seaportModule: await ethers.provider.getBalance(seaportModule.address),
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
        seaportModule: await contract.getBalance(seaportModule.address),
        nftxModule: await contract.getBalance(nftxModule.address),
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
    partial: boolean,
    // Number of offers to fill
    offersCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol

    // Holder
    const mockAddress = `0xc8c9771b59f9f217e8285889b9cdd7b9ddce0e86`;
    // Milady
    const mockCollection = '0x5af0d9827e0c53e4799bb226655a1de152a425a5';
    const vaultAddress = '0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48';
    const _vaultId = 392;
    const tokenId = 4341;
    const holdTokenIds = [
      4341,
      7028,
    ]

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [mockAddress],
    });

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [mockAddress, "0x1000000000000000000"],
    });


    // carol = await ethers.getSigner(mockAddress); 
    const offers: NFTXOffer[] = [];
    const fees: BigNumber[][] = [];
    const factory = await ethers.getContractFactory("MockERC721", deployer);
    carol = await ethers.getSigner(mockAddress);

    for (let i = 0; i < offersCount; i++) {

      if (holdTokenIds.length < i) {
        break;
      }
     
      const erc721 = await factory.attach(mockCollection);
      const offer: any = {
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: holdTokenIds[i],
        },
        price: parseEther(getRandomFloat(0.6, 5).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      }

      const poolPrice = await Sdk.Nftx.Helpers.getPoolPriceFor0x(
        vaultAddress,
        1,
        "sell",
        100,
        ethers.provider
      );

      const poolPriceOld = await Sdk.Nftx.Helpers.getPoolPrice(
        vaultAddress,
        1,
        "sell",
        100,
        ethers.provider
      );

      if (poolPrice.price) {
        offer.price = bn(poolPrice.price);
        offer.vault = vaultAddress;
        offer.order = new Sdk.Nftx.Order(chainId, {
          vaultId: _vaultId.toString(),
          pool: vaultAddress,
          collection: offer.nft.contract.address,
          currency: Sdk.Common.Addresses.Eth[chainId],
          specificIds: [offer.nft.id.toString()],
          price: offer.isCancelled
            ? offer.price.mul(bn(10)).toString()
            : offer.price.toString(),
          extra: {
            prices: [offer.price.toString()],
          },
          swapCallData: poolPrice.swapCallData,
          path: [],
        });
      }

      offers.push(offer);

      if (chargeFees) {
        fees.push([])
      } else {
        fees.push([]);
      }
    }

    const erc721 = await factory.attach(mockCollection);
    await erc721.connect(carol).transferFrom(carol.address, nftxModule.address, tokenId)

    // Prepare executions

    const executions: ExecutionInfo[] = [
      ...offers
        .filter((_) => _.order)
        .map((offer, i) => ({
          module: nftxModule.address,
          data: nftxModule.interface.encodeFunctionData("sell", [
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
    if (
      partial &&
      revertIfIncomplete &&
      offers.some(({ isCancelled }) => isCancelled)
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
    const balancesBefore = await getBalances(
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
    const balancesAfter = await getBalances(Sdk.Common.Addresses.Eth[chainId]);

    // Checks

    // Carol got the payment
    const orderFee = offers
      .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
      .map((executionFees) =>
        executionFees.reduce((a, b) => bn(a).add(b), bn(0))
      )
      .reduce((a, b) => bn(a).add(b), bn(0));

    const carolAfter = balancesAfter.carol.sub(balancesBefore.carol);
    const totalAmount = carolAfter.add(orderFee);

    const orderSum = offers
      .map((offer) => (offer.isCancelled ? bn(0) : bn(offer.price)))
      .reduce((a, b) => bn(a).add(b), bn(0));

    if (orderSum.gt(bn(0))) {
      const diffPercent =
        (parseFloat(formatEther(orderSum.sub(totalAmount))) /
          parseFloat(formatEther(totalAmount))) *
        100;

      // Check Carol balance
      const defaultSlippage = 5;
      expect(diffPercent).to.lte(defaultSlippage);
      expect(carolAfter).to.gte(bn(0));
    }

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
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.nftxModule).to.eq(0);
  };

  it("Accpect Offer", async () => testAcceptOffers(
    true,
    true,
    false,
    1
  ))
});
