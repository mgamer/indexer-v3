import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { getDittoContracts } from "../../router/helpers/ditto";
import { ContractReceipt } from "ethers";
import { getChainId, reset } from "../../utils";
import { expect } from "chai";
import abiDittoPool from "../../../../sdk/src/ditto/abis/DittoPool.json";

import * as Ditto from "@reservoir0x/sdk/src/ditto";

describe("Ditto Reservoir SDK support", () => {
  const chainId = getChainId();
  let deployer: SignerWithAddress;
  let poolAddress: string;
  let marketMaker: SignerWithAddress;
  const traderAddress = "0x00000000000000000000000000000000DeaDBeef";
  let trader: SignerWithAddress;
  let nft: Contract;
  let token: Contract;
  let dittoPool: Contract;
  let dittoPoolFactory: Contract;
  let router: Contract;
  let dittoModule: Contract;
  // random numbers that aren't likely to already have been minted
  const tokenId00 = ethers.BigNumber.from("0x13376969420123");
  const tokenId01 = ethers.BigNumber.from("0x13376969420124");

  let sdkRouter: Ditto.Router;

  beforeEach(async () => {
    ({ nft, token, dittoPoolFactory } = getDittoContracts());
    trader = await ethers.getImpersonatedSigner(traderAddress);
    [deployer, marketMaker] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    dittoModule = await ethers
      .getContractFactory("DittoModule", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));
    const ownerAddress: string = await dittoPoolFactory.owner();
    const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress);
    await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);
    // mint the NFTs to the market maker
    await nft.connect(marketMaker).mint(marketMaker.address, tokenId00);
    await nft.connect(marketMaker).setApprovalForAll(dittoPoolFactory.address, true);
    await token.connect(marketMaker).mint(marketMaker.address, parseEther("1000"));
    await token.connect(marketMaker).approve(dittoPoolFactory.address, parseEther("1"));
    // mint tokens to the trader
    await token.connect(trader).mint(trader.address, parseEther("1000"));
    await nft.connect(trader).mint(trader.address, tokenId01);

    //create a pool to trade with, with the NFTs deposited into the pool
    // the pool will have one NFT in it (tokenId00)
    // and 1 eth in it
    const poolTemplate = {
      isPrivatePool: false,
      templateIndex: 3, // LINEAR
      token: token.address,
      nft: nft.address,
      feeLp: 0,
      owner: marketMaker.address,
      feeAdmin: 0,
      delta: ethers.utils.parseEther("0.01"),
      basePrice: ethers.utils.parseEther("1"),
      nftIdList: [tokenId00],
      initialTokenBalance: ethers.utils.parseEther("1"),
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
    dittoPool = new ethers.Contract(poolAddress, abiDittoPool, trader);

    sdkRouter = new Ditto.Router(chainId);
  });

  afterEach(reset);

  it("Check fill buy order", async () => {
    await nft.ownerOf(tokenId00).then((owner: any) => {
      expect(owner).to.eq(poolAddress);
    });
    const orderParams: Ditto.OrderParams = {
      pool: poolAddress,
      recipient: trader.address,
      nftIds: [tokenId00],
      expectedTokenAmount: ethers.constants.MaxUint256,
      swapData: "0x",
    };
    await token
      .connect(trader)
      .approve(Ditto.Addresses.DittoPoolRouterRoyalties[chainId], ethers.constants.MaxUint256);
    const order = new Ditto.Order(chainId, orderParams);
    await sdkRouter.fillBuyOrder(trader, order);

    await nft.ownerOf(tokenId00).then((owner: any) => {
      expect(owner).to.eq(trader.address);
    });
  });

  it("Check fill sell order", async () => {
    await nft.ownerOf(tokenId01).then((owner: any) => {
      expect(owner).to.eq(trader.address);
    });
    const lpIds = await dittoPool.getAllPoolLpIds();
    const lpId = lpIds[0];
    const orderParams: Ditto.OrderParams = {
      pool: poolAddress,
      recipient: trader.address,
      nftIds: [tokenId01],
      lpIds: [lpId],
      expectedTokenAmount: ethers.constants.Zero,
      swapData: "0x",
      permitterData: "0x",
    };

    await nft
      .connect(trader)
      .setApprovalForAll(Ditto.Addresses.DittoPoolRouterRoyalties[chainId], true);
    const order = new Ditto.Order(chainId, orderParams);
    await sdkRouter.fillSellOrder(trader, order);

    await nft.ownerOf(tokenId01).then((owner: any) => {
      expect(owner).to.eq(dittoPool.address);
    });
  });
});
