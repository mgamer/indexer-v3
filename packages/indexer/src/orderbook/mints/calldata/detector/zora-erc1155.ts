import { CollectionMint } from "@/orderbook/mints";

import { Contract } from "@ethersproject/contracts";
import { baseProvider } from "@/common/provider";
import { defaultAbiCoder, Interface } from "@ethersproject/abi";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import { AllowlistItem, allowlistExists, createAllowlist } from "@/orderbook/mints/allowlists";
import axios from "axios";
import { bn } from "@/common/utils";

const STANDARD = "zora";

enum SaleStrategy {
  ZoraCreatorFixedPriceSaleStrategy = "Fixed Price Sale Strategy",
  ZoraCreatorMerkleMinterStrategy = "Merkle Tree Sale Strategy",
  ZoraCreatorRedeemMinterStrategy = "Redeem Minter Sale Strategy",
}

export async function extractByCollectionERC1155(collection: string, data: string) {
  if (!data.startsWith("0x731133e9")) {
    return [];
  }

  const results: CollectionMint[] = [];
  const [minter, tokenId] = defaultAbiCoder.decode(
    ["address", "uint256", "uint256", "bytes"],
    `0x${data.slice(10)}`
  );

  const strategy = new Contract(
    minter,
    new Interface([
      "function contractName() external view returns (string memory)",
      "function contractVersion() external view returns (string memory)",
    ]),
    baseProvider
  );

  const [
    contractName,
    // contractVersion
  ] = await Promise.all([
    strategy.contractName(),
    // strategy.contractVersion()
  ]);

  const nft = new Contract(
    collection,
    new Interface([
      `function mintFee() external view returns(uint256)`,
      {
        inputs: [
          {
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
          },
        ],
        name: "getTokenInfo",
        outputs: [
          {
            components: [
              {
                internalType: "string",
                name: "uri",
                type: "string",
              },
              {
                internalType: "uint256",
                name: "maxSupply",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalMinted",
                type: "uint256",
              },
            ],
            internalType: "struct IZoraCreator1155TypesV1.TokenData",
            name: "",
            type: "tuple",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ]),
    baseProvider
  );

  if (contractName === SaleStrategy.ZoraCreatorFixedPriceSaleStrategy) {
    const fixedSale = new Contract(
      minter,
      new Interface([
        {
          inputs: [
            {
              internalType: "address",
              name: "tokenContract",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "tokenId",
              type: "uint256",
            },
          ],
          name: "sale",
          outputs: [
            {
              components: [
                {
                  internalType: "uint64",
                  name: "saleStart",
                  type: "uint64",
                },
                {
                  internalType: "uint64",
                  name: "saleEnd",
                  type: "uint64",
                },
                {
                  internalType: "uint64",
                  name: "maxTokensPerAddress",
                  type: "uint64",
                },
                {
                  internalType: "uint96",
                  name: "pricePerToken",
                  type: "uint96",
                },
                {
                  internalType: "address",
                  name: "fundsRecipient",
                  type: "address",
                },
              ],
              internalType: "struct ZoraCreatorFixedPriceSaleStrategy.SalesConfig",
              name: "",
              type: "tuple",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ]),
      baseProvider
    );

    const [saleConfig, tokenInfo, mintFee] = await Promise.all([
      fixedSale.sale(collection, tokenId),
      nft.getTokenInfo(tokenId),
      nft.mintFee(),
    ]);
    const price = saleConfig.pricePerToken.add(mintFee).toString();
    results.push({
      collection,
      contract: collection,
      stage: "public-sale",
      kind: "public",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: collection,
          data: {
            // `mint`
            signature: "0x731133e9",
            params: [
              {
                kind: "unknown",
                abiType: "address",
                abiValue: minter,
              },
              {
                kind: "unknown",
                abiType: "uint256",
                abiValue: tokenId.toString(),
              },
              {
                kind: "quantity",
                abiType: "uint256",
              },
              {
                kind: "zora-erc1155",
                abiType: "bytes",
                type: "fixed-price",
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Eth[config.chainId],
      price,
      maxMintsPerWallet: saleConfig.maxTokensPerAddress.toString(),
      tokenId: tokenId.toString(),
      maxSupply: tokenInfo.maxSupply.toString(),
      startTime: toSafeTimestamp(saleConfig.saleStart),
      endTime: toSafeTimestamp(saleConfig.saleEnd),
    });
  } else if (contractName === SaleStrategy.ZoraCreatorMerkleMinterStrategy) {
    const merkleSale = new Contract(
      minter,
      new Interface([
        {
          inputs: [
            {
              internalType: "address",
              name: "tokenContract",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "tokenId",
              type: "uint256",
            },
          ],
          name: "sale",
          outputs: [
            {
              components: [
                {
                  internalType: "uint64",
                  name: "presaleStart",
                  type: "uint64",
                },
                {
                  internalType: "uint64",
                  name: "presaleEnd",
                  type: "uint64",
                },
                {
                  internalType: "address",
                  name: "fundsRecipient",
                  type: "address",
                },
                {
                  internalType: "bytes32",
                  name: "merkleRoot",
                  type: "bytes32",
                },
              ],
              internalType: "struct ZoraCreatorMerkleMinterStrategy.MerkleSaleSettings",
              name: "",
              type: "tuple",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ]),
      baseProvider
    );
    const [saleConfig, tokenInfo, mintFee] = await Promise.all([
      merkleSale.sale(collection, tokenId),
      nft.getTokenInfo(tokenId),
      nft.mintFee(),
    ]);
    const merkleRoot = merkleSale.merkleRoot;
    if (!(await allowlistExists(merkleRoot))) {
      await axios
        .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
        .then(({ data }) => data)
        .then(async (data: { entries: { user: string; price: string; maxCanMint: number }[] }) => {
          return data.entries.map(
            (e) =>
              ({
                address: e.user,
                maxMints: String(e.maxCanMint),
                // price = on-chain-price
                price: e.price,
                // actualPrice = on-chain-price + fee
                actualPrice: bn(e.price).add(mintFee).toString(),
              } as AllowlistItem)
          );
        })
        .then((items) => createAllowlist(merkleRoot, items));
    }
    results.push({
      collection,
      contract: collection,
      stage: "presale",
      kind: "allowlist",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: collection,
          data: {
            // `purchasePresale`
            signature: "0x25024a2b",
            params: [
              {
                kind: "unknown",
                abiType: "address",
                abiValue: minter,
              },
              {
                kind: "unknown",
                abiType: "uint256",
                abiValue: tokenId.toString(),
              },
              {
                kind: "quantity",
                abiType: "uint256",
              },
              {
                kind: "zora-erc1155",
                abiType: "bytes",
                type: "merkle",
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Eth[config.chainId],
      maxSupply: tokenInfo.maxSupply.toString(),
      startTime: toSafeTimestamp(saleConfig.presaleStart),
      endTime: toSafeTimestamp(saleConfig.presaleEnd),
      allowlistId: merkleRoot,
    });
  } else if (contractName === SaleStrategy.ZoraCreatorRedeemMinterStrategy) {
    // Redeem
  }
  return results;
}
