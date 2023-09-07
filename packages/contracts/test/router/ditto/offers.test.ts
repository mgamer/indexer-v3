import { Contract, ContractReceipt } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect, assert } from "chai";
import { getDittoContracts } from "../helpers/ditto";
import abiDittoPool from "../../../../sdk/src/ditto/abis/DittoPool.json";

describe("DittoModule", () => {
  let initialTokenBalance: BigNumber;
  let deployer: SignerWithAddress;
  let marketMaker: SignerWithAddress;
  let marketMakerAddress: string;
  let trader: SignerWithAddress;
  let traderAddress: string;
  let poolAddress: string;
  let dittoPool: Contract;

  let marketMakerLpId: BigNumber;

  let nft: Contract;
  let token: Contract;
  let dittoPoolFactory: Contract;

  let router: Contract;
  let dittoModule: Contract;

  beforeEach(async () => {
    ({ nft, token, dittoPoolFactory } = getDittoContracts());

    marketMakerAddress = "0x00000000000000000000000000000000DeaDBeef";
    marketMaker = await ethers.getImpersonatedSigner(marketMakerAddress);
    traderAddress = "0x00000000000000000000000000000000cafebabe";
    trader = await ethers.getImpersonatedSigner(traderAddress);

    [deployer] = await ethers.getSigners();

    initialTokenBalance = parseEther("100");

    // deploy and whitelist reservoir module in Ditto protocol
    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    dittoModule = await ethers
      .getContractFactory("DittoModule", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));

    const dittoDeployerAddress: string = await dittoPoolFactory.connect(deployer).owner();
    const dittoDeployer: SignerWithAddress = await ethers.getImpersonatedSigner(
      dittoDeployerAddress
    );
    await dittoPoolFactory.connect(dittoDeployer).addRouters([dittoModule.address]);

    // Create a ditto pool with some tokens in it to buy NFTs with, but no NFTs
    await token.connect(marketMaker).mint(marketMakerAddress, initialTokenBalance);
    await token.balanceOf(marketMakerAddress).then((balance: BigNumber) => {
      assert(balance.eq(initialTokenBalance), "market maker does not have initial token balance");
    });
    await token.connect(marketMaker).approve(dittoPoolFactory.address, initialTokenBalance);

    const poolTemplate = {
      isPrivatePool: false,
      templateIndex: 3, // DittoPoolLin
      token: token.address,
      nft: nft.address,
      feeLp: 0,
      owner: marketMakerAddress,
      feeAdmin: 0,
      delta: parseEther("0.1"),
      basePrice: parseEther("1"),
      nftIdList: [],
      initialTokenBalance: initialTokenBalance,
      templateInitData: "0x",
      referrer: "0x",
    };

    const poolManagerTemplate: any = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
    };

    const permitterTemplate = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
      liquidityDepositPermissionData: "0x",
    };

    const createDittoPoolTxn = await dittoPoolFactory
      .connect(marketMaker)
      .createDittoPool(poolTemplate, poolManagerTemplate, permitterTemplate);
    let createDittoPoolReceipt: ContractReceipt = await createDittoPoolTxn.wait();

    // from the creation transaction, get the new pool address and the LP ID for the position
    const dittoPoolInterface = new ethers.utils.Interface(abiDittoPool);
    createDittoPoolReceipt.events!.forEach((event) => {
      if (event.event === "DittoPoolFactoryDittoPoolCreated") {
        poolAddress = event.args!.dittoPool;
      }
    });
    createDittoPoolReceipt.logs.forEach((log) => {
      try {
        const event = dittoPoolInterface.parseLog(log);
        if (event.name === "DittoPoolMarketMakeLiquidityCreated") {
          marketMakerLpId = event.args!.lpId;
        }
      } catch (e) {
        return;
      }
    });

    dittoPool = new Contract(poolAddress, dittoPoolInterface, ethers.provider);
  });

  it("Sell an NFT into a pool", async () => {
    const tokenId00 = 130019123456789; // probably not minted yet
    await nft.connect(trader).mint(traderAddress, tokenId00);
    await nft.ownerOf(tokenId00).then((owner: string) => {
      expect(owner).to.eq(traderAddress);
    });
    await nft.connect(trader).setApprovalForAll(dittoModule.address, true);
    const traderInitialBalance = await token.balanceOf(traderAddress);

    const sellQuote = await dittoPool.getSellNftQuote(1, "0x");
    let outputValue = sellQuote[3];

    const fee = [poolAddress, 0];

    const orderParams = {
      nftIds: [tokenId00],
      swapData: "0x",
    };

    const offerParams = {
      fillTo: traderAddress,
      refundTo: traderAddress,
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

    let data = dittoModule.interface.encodeFunctionData("sell", sell);

    const executions = [dittoModule.address, data, 0];

    await router.execute([executions]);

    await nft.ownerOf(tokenId00).then((owner: any) => {
      expect(owner).to.eq(poolAddress);
    });

    const traderFinalBalance = await token.balanceOf(traderAddress);
    assert(traderFinalBalance.gt(traderInitialBalance), "trader balance should be greater");
    assert(
      traderFinalBalance.eq(traderInitialBalance.add(outputValue)),
      "trader balance should be greater by exactly output value"
    );
  });
});
