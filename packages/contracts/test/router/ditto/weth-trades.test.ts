import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractReceipt } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getDittoContracts } from "../helpers/ditto";
import { getChainId, reset } from "../../utils";

import DittoPoolAbi from "@reservoir0x/sdk/src/ditto/abis/DittoPool.json";
import { generateSwapInfo } from "@reservoir0x/sdk/src/router/v6/swap";
import * as Sdk from "@reservoir0x/sdk/src";

describe("DittoModule", () => {
  let chainId: number;
  let poolAddress: string;
  let initialTokenBalance: BigNumber;
  let deployer: SignerWithAddress;
  let marketMaker: SignerWithAddress;
  let trader: SignerWithAddress;
  let marketMakerLpId: BigNumber;

  let nft: Contract;
  let dittoPool: Contract;
  let dittoPoolFactory: Contract;

  let router: Contract;
  let dittoModule: Contract;
  let weth: Contract;
  let swapModule: Contract;

  // Random numbers that aren't likely to already have been minted
  const tokenId00 = ethers.BigNumber.from("0x13376969420123");
  const tokenId01 = ethers.BigNumber.from("0x13376969420124");

  beforeEach(async () => {
    chainId = getChainId();
    ({ nft, dittoPoolFactory, weth } = getDittoContracts());
    // signers start off with 10,000 ETH
    [deployer, marketMaker, trader] = await ethers.getSigners();
    initialTokenBalance = parseEther("100");

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    dittoModule = await ethers
      .getContractFactory("DittoModule", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));
    swapModule = await ethers
      .getContractFactory("SwapModule", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, weth.address, ethers.constants.AddressZero)
      );

    const ownerAddress: string = await dittoPoolFactory.owner();
    const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress);
    await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);

    await nft.connect(marketMaker).mint(marketMaker.address, tokenId00);
    await nft.connect(marketMaker).mint(marketMaker.address, tokenId01);
    await nft.connect(marketMaker).setApprovalForAll(dittoPoolFactory.address, true);
    const deposit = await weth.connect(marketMaker).deposit({ value: initialTokenBalance });
    await deposit.wait();
    await weth.connect(marketMaker).approve(dittoPoolFactory.address, ethers.constants.MaxUint256);

    // Create a pool to trade with, with the NFTs deposited into the pool

    const poolTemplate = {
      isPrivatePool: false,
      templateIndex: 3, // LINEAR
      token: weth.address,
      nft: nft.address,
      feeLp: 0,
      owner: marketMaker.address,
      feeAdmin: 0,
      delta: ethers.utils.parseEther("1.01"),
      basePrice: ethers.utils.parseEther("3"),
      nftIdList: [tokenId00, tokenId01],
      initialTokenBalance: initialTokenBalance,
      templateInitData: "0x",
      referrer: "0x",
    };
    const poolManagerTemplate = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
    };
    const permitterTemplate = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
      liquidityDepositPermissionData: "0x",
    };
    const creation = await dittoPoolFactory
      .connect(marketMaker)
      .createDittoPool(poolTemplate, poolManagerTemplate, permitterTemplate);
    const result: ContractReceipt = await creation.wait();
    result.events!.forEach((event) => {
      if (event.event === "DittoPoolFactoryDittoPoolCreated") {
        poolAddress = event.args!.dittoPool;
      }
    });
    const dittoPoolInterface = new ethers.utils.Interface(DittoPoolAbi);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.logs.forEach((log: any) => {
      try {
        const event = dittoPoolInterface.parseLog(log);
        if (event.name === "DittoPoolMarketMakeLiquidityCreated") {
          marketMakerLpId = event.args!.lpId;
        }
      } catch (e) {
        return;
      }
    });
    dittoPool = new ethers.Contract(poolAddress, DittoPoolAbi, trader);
  });

  afterEach(reset);

  it("Purchase an NFT with unwrapped native ether", async () => {
    await weth.balanceOf(trader.address).then((balance: BigNumber) => {
      expect(balance).to.equal(ethers.constants.Zero);
    });

    const wrapInfo = await generateSwapInfo(
      chainId,
      ethers.getDefaultProvider(),
      "",
      Sdk.Common.Addresses.Native[chainId],
      weth.address,
      initialTokenBalance,
      {
        module: swapModule,
        transfers: [
          {
            toETH: false,
            recipient: trader.address,
            amount: initialTokenBalance,
          },
        ],
        refundTo: trader.address,
        revertIfIncomplete: true,
      }
    );

    const approve = await weth.connect(trader).approve(dittoModule.address, initialTokenBalance);
    await approve.wait();

    // Fetch the current price
    const result = await dittoPool.getBuyNftQuote(2, "0x");
    const inputValue = result[3];

    const fillTo: string = trader.address;
    const refundTo: string = trader.address;
    const revertIfIncomplete = false;
    const amountPayment: BigNumber = inputValue;

    const eRC20ListingParams = [fillTo, refundTo, revertIfIncomplete, weth.address, amountPayment];

    const recipient: string = dittoPool.address;
    const amountFee: BigNumber = parseEther("0");

    const fee = [recipient, amountFee];

    const orderParams = [[tokenId00, tokenId01], "0x"];

    const buyWithERC20 = [[dittoPool.address], [orderParams], eRC20ListingParams, [fee]];

    const data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);
    const executions = [dittoModule.address, data, 0];
    await router
      .connect(trader)
      .execute([wrapInfo.execution, executions], { value: initialTokenBalance });

    await nft.ownerOf(tokenId00).then((owner: string) => {
      expect(owner).to.eq(fillTo);
    });
    await nft.ownerOf(tokenId01).then((owner: string) => {
      expect(owner).to.eq(fillTo);
    });
    await weth.balanceOf(trader.address).then((balance: BigNumber) => {
      expect(balance).to.equal(initialTokenBalance.sub(amountPayment));
    });
  });

  it("Sell an NFT for native unwrapped ether", async () => {
    await weth.balanceOf(trader.address).then((balance: BigNumber) => {
      expect(balance).to.equal(ethers.constants.Zero);
    });
    await trader.getBalance().then((balance: BigNumber) => {
      expect(balance).to.equal(parseEther("10000"));
    });
    await weth.balanceOf(dittoPool.address).then((balance: BigNumber) => {
      expect(balance).to.equal(initialTokenBalance);
    });
    const tokenId03 = 130019123456789; // probably not minted yet
    await nft.connect(trader).mint(trader.address, tokenId03);
    await nft.ownerOf(tokenId03).then((owner: string) => {
      expect(owner).to.eq(trader.address);
    });
    await nft.connect(trader).setApprovalForAll(dittoModule.address, true);

    const sellQuote = await dittoPool.getSellNftQuote(1, "0x");
    const outputValue = sellQuote[3];

    const fee = [poolAddress, 0];

    const orderParams = {
      nftIds: [tokenId03],
      swapData: "0x",
    };

    const offerParams = {
      fillTo: trader.address,
      refundTo: trader.address,
      revertIfIncomplete: false,
    };

    const sell = [
      poolAddress,
      orderParams,
      [marketMakerLpId.toString()],
      "0x",
      outputValue,
      offerParams,
      [fee],
    ];

    const data = dittoModule.interface.encodeFunctionData("sell", sell);
    const swapExecution = [dittoModule.address, data, 0];

    await weth.connect(trader).approve(router.address, outputValue);

    const unWrapInfo = await generateSwapInfo(
      chainId,
      ethers.getDefaultProvider(),
      "",
      weth.address,
      Sdk.Common.Addresses.Native[chainId],
      outputValue,
      {
        module: swapModule,
        transfers: [
          {
            toETH: true,
            recipient: trader.address,
            amount: outputValue,
          },
        ],
        refundTo: trader.address,
        revertIfIncomplete: false,
      }
    );

    // the unwrap function on the swapModule only works if the swap module
    // holds the weth itself. But the DittoModule (right now) won't let you
    // send the weth to another address other than the trader
    // so we have to send the swapModule the weth so that it can then unwrap it
    // and send it back
    const transferFromDetail = weth.interface.getFunction(
      "transferFrom(address, address, uint256)"
    );
    const transferFromData = weth.interface.encodeFunctionData(transferFromDetail, [
      trader.address,
      swapModule.address,
      outputValue,
    ]);
    const transferFromExecution = [weth.address, transferFromData, 0];

    const traderBalanceBeforeTrade = await trader.getBalance();
    const executionPath = [swapExecution, transferFromExecution, unWrapInfo.execution];
    const routerExecution = await router.connect(trader).execute(executionPath);
    const routerExecutionReceipt = await routerExecution.wait();
    const routerExecutionGasUsed = routerExecutionReceipt.gasUsed;
    const routerExecutionGasPrice = routerExecutionReceipt.effectiveGasPrice;
    const routerExecutionGasCost = routerExecutionGasUsed.mul(routerExecutionGasPrice);

    await trader.getBalance().then((balance: BigNumber) => {
      expect(balance).to.equal(
        ethers.BigNumber.from(traderBalanceBeforeTrade).add(outputValue).sub(routerExecutionGasCost)
      );
    });
  });
});
