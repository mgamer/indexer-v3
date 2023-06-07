import { Interface } from "@ethersproject/abi";
import { SudoswapV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const sellERC721: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-sell-erc721",
  topic: "0x7a0e7e58d91fd23a96b0008604db1b2d1cee4aae434e3aad9a20fdd7c0995f89",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair(uint256 amountOut, uint256[] ids)`]),
};

export const sellERC1155: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-sell-erc1155",
  topic: "0x58e7e2e8d4c949c019e4fe5f6e2a8f10e4e078a8747730386e9a230da8c969f0",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair(uint256 amountOut, uint256 numNFTs)`]),
};

export const buyERC721: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-buy-erc721",
  topic: "0xa13c46268c53408442d94eb370f2e476cb7f0fbe027ae5bad73ce13d4469c8b9",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOutPair(uint256 amountIn, uint256[] ids)`]),
};

export const buyERC1155: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-buy-erc1155",
  topic: "0xd9c2402e1a067734ae78dab98f06d5b28e8a2d2c6370ec0e6ff8cc2749d050f1",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOutPair(uint256 amountIn, uint256 numNFTs)`]),
};

export const tokenDeposit: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-token-deposit",
  topic: "0xf1b3be8dace0fecfbdb6fb0fa1cc014c612bcb1b46db027c1ece5fc11fff09d6",
  numTopics: 1,
  abi: new Interface([`event TokenDeposit(uint256 amount)`]),
};

export const tokenWithdrawal: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-token-withdrawal",
  topic: "0x0e266e8f38544aa1480d73762386eb10df55b1b8453d935762e891c44b69a1e6",
  numTopics: 1,
  abi: new Interface([`event TokenWithdrawal(uint256 amount)`]),
};

export const spotPriceUpdate: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-spot-price-update",
  topic: "0xf06180fdbe95e5193df4dcd1352726b1f04cb58599ce58552cc952447af2ffbb",
  numTopics: 1,
  abi: new Interface([`event SpotPriceUpdate(uint128 newSpotPrice)`]),
};

export const deltaUpdate: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-delta-update",
  topic: "0xc958ae052d28f8d17bc2c4ddbabb699a3cab5cccefd034d0fc971efdadc01da5",
  numTopics: 1,
  abi: new Interface([`event DeltaUpdate(uint128 newDelta)`]),
};

export const newERC721Pair: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-new-erc721-pair",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8e1cee58c33f242c87d563bbc00f2ac82eb90f10a252b0ba8498ae6c1dc241a",
  numTopics: 1,
  abi: new Interface([`event NewERC721Pair(address indexed poolAddress, uint256[] initialIds)`]),
};

export const newERC1155Pair: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-new-erc1155-pair",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0x2966b6b401975e778520aec46cbefbe73799119a5670feda3e8f884c7c3ffb11",
  numTopics: 1,
  abi: new Interface([`event NewERC1155Pair(address indexed poolAddress, uint256 initialBalance)`]),
};
