/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as Sdk from "@reservoir0x/sdk/src";
import * as indexerHelper from "../../indexer-helper";
import { getChainId, bn, setupNFTs } from "../../utils";
import { parseEther, parseUnits } from "@ethersproject/units";

describe("PermitBidding - Indexer Integration Test", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    // Reset Indexer
    await indexerHelper.reset();
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(async () => {
    // await reset();
  });

  const testCase = async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = Math.floor(Math.random() * 100000);
    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);
    await weth.deposit(seller, price);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    // Store collection
    await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      nfts: [
        {
          collection: erc721.address,
          tokenId: boughtTokenId.toString(),
          owner: seller.address,
        },
      ],
      orders: [
      ],
    });

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    // Get some USDC
    const swapExecutions = [
      {
        module: router.contracts.swapModule.address,
        data: router.contracts.swapModule.interface.encodeFunctionData("ethToExactOutput", [
          [
            {
              params: {
                tokenIn: Sdk.Common.Addresses.WNative[chainId],
                tokenOut: Sdk.Common.Addresses.Usdc[chainId],
                fee: 500,
                recipient: router.contracts.swapModule.address,
                amountOut: parseUnits("50000", 6),
                amountInMaximum: parseEther("50"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: buyer.address,
                  amount: parseUnits("50000", 6),
                  toETH: false,
                },
              ],
            },
          ],
          buyer.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("50"),
      },
    ];

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);

    await router.contracts.router.connect(buyer).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const bidParams = {
      "params": [
        {
          "orderKind": "seaport-v1.5",
          "options": {
            "seaport-v1.4": {
              "useOffChainCancellation": true
            },
            "seaport-v1.5": {
              "useOffChainCancellation": true
            }
          },
          "orderbook": "reservoir",
          "automatedRoyalties": true,
          "excludeFlaggedTokens": false,
          "currency": Common.Addresses.Usdc[chainId],
          "weiPrice": "1000000", // 1 USDC
          token: `${erc721.address}:${boughtTokenId}`,
        }
      ],
      maker: buyer.address,
    }

    const bidResponse = await indexerHelper.executeBidV5(bidParams);

    const saveOrderStep = bidResponse.steps[3];
    const orderSignature = saveOrderStep.items[0];

    const {
      steps
    } = bidResponse;

    // Handle permit approval
    const permitApproval = steps[2];
    for(const item of permitApproval.items) {
      const eipMessage = item.data.sign;
      const signature = await buyer._signTypedData(
        eipMessage.domain,
        eipMessage.types,
        eipMessage.value
      );

      // Store permit bidding signature
      const permitId = item.data.post.body.id;
      const response = await indexerHelper.savePreSignature(signature, permitId);
      // const {v, r, s} = splitSignature(signature);
      // const permitTx = {
      //   from: seller.address,
      //   to: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      //   data: new Interface([
      //     `function permit(
      //       address owner,
      //       address spender,
      //       uint256 value,
      //       uint256 deadline,
      //       uint8 v,
      //       bytes32 r,
      //       bytes32 s
      //     )`
      //   ]).encodeFunctionData('permit', [
      //     eipMessage.value.owner,
      //     eipMessage.value.spender,
      //     eipMessage.value.value,
      //     eipMessage.value.deadline,
      //     v,
      //     r,
      //     s
      //   ])
      // }

      // console.log('permitTx', permitTx)
      // const permitRes = await seller.sendTransaction(permitTx)
      // console.log("permitRes", permitRes)
    }

    const bidResponse2 = await indexerHelper.executeBidV5(bidParams);
    const saveOrderStep2 = bidResponse2.steps[3];
    const orderSignature2 = saveOrderStep2.items[0];

    const bidMessage = orderSignature2.data.sign;
    const offerSignature = await buyer._signTypedData(
      bidMessage.domain,
      bidMessage.types,
      bidMessage.value
    );

    const postRequest = orderSignature2.data.post;
    const orderInfo = postRequest.body.order.data;

    const orderSaveResult = await indexerHelper.callStepAPI(postRequest.endpoint, offerSignature, postRequest.body);
    const orderId = orderSaveResult.orderId;

    const executeResponse = await indexerHelper.executeSellV7({
      items: [
        {
          token: `${erc721.address}:${boughtTokenId}`,
          quantity: 1,
          orderId
        },
      ],
      taker: seller.address,
      forceRouter: true,
    });

    const allSteps = executeResponse.steps;

    await seller.sendTransaction(allSteps[0].items[0].data);

    const lastSetp = allSteps[allSteps.length - 1];

    const tx = await seller.sendTransaction(lastSetp.items[0].data);
    await tx.wait();
  };

  it("Create permit bidding and execute", async () => testCase());
});
