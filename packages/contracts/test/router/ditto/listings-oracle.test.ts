import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import abiDittoAppraisal from "../../../../sdk/src/ditto/abis/DittoPoolApp.json";
import abiUpshotOracle from "../../../../sdk/src/ditto/abis/UpshotOracle.json";
import { getDittoContracts } from "../helpers/ditto";
import { Bytes } from "ethers";

import * as Sdk from "../../../../sdk/src";

/**
 * run with the following command:
 *
 * BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/listings-oracle.test.ts
 */
describe("DittoModule", () => {
  let initialTokenBalance: BigNumber;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;

  let nft: Contract;
  let token: Contract;
  let dittoPoolFactory: Contract;

  let router: Contract;
  let dittoModule: Contract;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();

    const dittoContracts  = getDittoContracts()
    nft = dittoContracts.nft
    token = dittoContracts.token
    dittoPoolFactory = dittoContracts.dittoPoolFactory

    let adminAddress = "0x00000000000000000000000000000000DeaDBeef";
    alice = await ethers.getImpersonatedSigner(adminAddress);

    initialTokenBalance =  ethers.utils.parseEther("10");

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    dittoModule = await ethers
      .getContractFactory("DittoModule", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));

    const ownerAddress: string = await dittoPoolFactory.owner();
    const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress);
    await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);
  });

  it("Upshot oracle test", async () => {
    // pick a random token id that hasn't yet been minted on goerli
    const tokenId04 = ethers.utils.keccak256("0xdeadbeef");

    // mint alice some NFTs and tokens to do trading with.
    await nft.connect(alice).mint(alice.address, tokenId04);
    await nft.connect(alice).setApprovalForAll(dittoPoolFactory.address, true);
    await token.connect(alice).mint(alice.address, parseEther("100"));
    await token.connect(alice).approve(dittoPoolFactory.address, parseEther("100"));
    let approve = await token.connect(alice).approve(dittoModule.address, parseEther("100"));
    await approve.wait();

    // sanity checks
    await token.balanceOf(alice.address).then((balance: any) => {
      expect(balance).to.equal(parseEther("100"));
    });

    await nft.ownerOf(tokenId04).then((owner: string) => {
      expect(owner).to.equal(alice.address);
    });

    // set up the oracle contract for the test
    const upshotOracle: Contract = new Contract(
      Sdk.Ditto.Addresses.UpshotOracle[5],
      abiUpshotOracle,
      ethers.provider
    );
    const oracleOwnerAddress = await upshotOracle.owner();
    const oracleOwnerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(
      oracleOwnerAddress
    );
    // make it easier for us to forge appraisals for testing with
    await upshotOracle.connect(oracleOwnerSigner).setAuthenticator(deployer.address);

    // set params for creating a pool
    const isPrivatePool = false; // allow any member of the public to provide liquidity to this pool
    const templateIndex = 6; //DittoPoolApp
    const tokenAddress = token.address; // which ERC20 we are trading
    const nftAddress = nft.address; // which NFT we are trading
    const feeLp = 0; // The percentage fee paid to the LP provider for their service of providing liquidity
    const ownerAddress = alice.address; // the owner of the pool for pool administrative tasks
    const feeAdmin = 0; // The percentage fee paid to the pool admin for their service of administrating the pool
    const delta = 0; // Unused in appraisal pools
    const basePrice = 0; // Unused in appraisal pools
    const nftIdList: any[] = [tokenId04]; // initial liquidity deposit of token 4
    const initialTokenBalance = ethers.utils.parseEther("1"); // inital liquidity deposit of 1 ether
    // the inital template for creating a ditto appraisal pool takes 3 parameters:
    // first, the address of the oracle to be used for this appraisal pool
    // then as safety guardrail for the range at which a pool should ignore appraisal prices
    // and never sell. E.g.:
    // The minPriceSell to never sell an NFT for less than
    // and the maxPriceBuy to never buy an NFT for more than
    // for this example we set that to 1 wei and 10 ether respectively, so an appraisal will be ignored
    // if it's for sale for more than 10 ether or less than 1 wei, even if 
    // the appraisal is validly signed by the upshot oracle
    const templateInitData: any = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256", "uint256"],
      [Sdk.Ditto.Addresses.UpshotOracle[5], "1", ethers.utils.parseEther("10")]
    );
    const referrer: any = new Uint8Array([]); // used with ditto referral program.

    const poolTemplate: any = {
      isPrivatePool: isPrivatePool,
      templateIndex: templateIndex,
      token: tokenAddress,
      nft: nftAddress,
      feeLp: feeLp,
      owner: ownerAddress,
      feeAdmin: feeAdmin,
      delta: delta,
      basePrice: basePrice,
      nftIdList: nftIdList,
      initialTokenBalance: initialTokenBalance,
      templateInitData: templateInitData,
      referrer: referrer,
    };

    // we do not use a pool manager for this pool
    const mngrTemplateIndex = ethers.constants.MaxUint256
    const mngrInitData = new Uint8Array([]);
    const poolManagerTemplate: any = {
      templateIndex: mngrTemplateIndex,
      templateInitData: mngrInitData,
    };

    // nor do we use a pool permitter
    const permitterTemplateIndex = ethers.constants.MaxUint256
    const permitterInitData = new Uint8Array([]);
    const liquidityDepositPermissionData = new Uint8Array([]);
    const permitterTemplate = {
      templateIndex: permitterTemplateIndex,
      templateInitData: permitterInitData,
      liquidityDepositPermissionData: liquidityDepositPermissionData,
    };

    // create the pool
    const poolCreateTxn = await dittoPoolFactory
      .connect(deployer)
      .createDittoPool(poolTemplate, poolManagerTemplate, permitterTemplate);
    let output = await poolCreateTxn.wait();

    // find out the address of the newly created pool for further transactions
    const event: any = output.events.find(
      (event: { event: string }) => event.event === "DittoPoolFactoryDittoPoolCreated"
    );
    const dpAddress = event.args.dittoPool;
    const dittoPool: Contract = new Contract(dpAddress, abiDittoAppraisal, ethers.provider);

    // now approve the pool for further trading 
    await token.connect(alice).approve(dittoPool.address, parseEther("100"));

    // sanity check
    const oracleAddress: any = await dittoPool.oracle();
    expect(oracleAddress).to.eq(Sdk.Ditto.Addresses.UpshotOracle[5]);
    

    // construct an appraisal like you would get from the upshot appraisal API
    const chainId = 5;
    const nonce = BigNumber.from(1);
    // Fri Jan 01 2016 05:00:00 GMT+0000
    const timestamp = BigNumber.from("1451624400");
    // Wed Dec 30 2099 00:00:00 GMT+0000
    const expiration = BigNumber.from("4102272000");
    const price = ethers.utils.parseEther("1");
    const extraData: Bytes = []
    // create a signature for this appraisal
    let messageHash = ethers.utils.solidityKeccak256(
      ["uint256", "uint256", "address", "uint256", "address", "uint256", "uint96", "uint96", "bytes"],
      [chainId, nonce, nft.address, tokenId04, token.address, price, timestamp, expiration, extraData]
    );
    let messageHashBytes = ethers.utils.arrayify(messageHash);
    let flatSig = await deployer.signMessage(messageHashBytes);

    // appraisal in struct form
    const priceData: any = {
      signature: flatSig,
      nonce: nonce,
      nft: nft.address,
      timestamp: timestamp,
      token: token.address,
      expiration: expiration,
      nftId: tokenId04,
      price: price,
      extraData: extraData,
    };

    const swapData = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(bytes signature,uint256 nonce,address nft,uint96 timestamp,address token,uint96 expiration,uint256 nftId,uint256 price,bytes extraData)[]",
      ],
      [[priceData]]
    );

    const fillTo: string = alice.address;
    const refundTo: string = alice.address;
    const revertIfIncomplete: boolean = false;
    const amountPayment: BigNumber = parseEther("1.2");

    const eRC20ListingParams = [fillTo, refundTo, revertIfIncomplete, tokenAddress, amountPayment];

    const recipient: string = dittoPool.address;
    const amountFee: BigNumber = parseEther("0");

    const fee = [recipient, amountFee];

    const orderParams = [[tokenId04], swapData];

    const buyWithERC20 = [[dittoPool.address], [orderParams], eRC20ListingParams, [fee]];

    let data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

    const executions = [dittoModule.address, data, 0];

    await router.execute([executions]);

    await nft.ownerOf(tokenId04).then((owner: any) => {
      expect(owner).to.eq(fillTo);
    });
  });
});
