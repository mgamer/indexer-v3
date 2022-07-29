import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";

export const erc721SellOrderFilled: EventData = {
  kind: "element-erc721-sell-order-filled",
  addresses: { ["0x20F780A973856B93f63670377900C1d2a50a77c4".toLowerCase()]: true },
  topic: "0x8a0f8e04e7a35efabdc150b7d106308198a4f965a5d11badf768c5b8b273ac94",
  numTopics: 1,
  abi: new Interface([
    `event ERC721SellOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20TokenAmount,
      address erc721Token,
      uint256 erc721TokenId,
      bytes32 orderHash
    )`,
  ]),
};

export const erc721BuyOrderFilled: EventData = {
  kind: "element-erc721-buy-order-filled",
  addresses: { ["0x20F780A973856B93f63670377900C1d2a50a77c4".toLowerCase()]: true },
  topic: "0xa24193d56ccdf64ce1df60c80ca683da965a1da3363efa67c14abf62b2d7d493",
  numTopics: 1,
  abi: new Interface([
    `event ERC721BuyOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20TokenAmount,
      address erc721Token,
      uint256 erc721TokenId,
      bytes32 orderHash
    )`,
  ]),
};
