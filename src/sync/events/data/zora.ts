import { Interface } from "@ethersproject/abi";
import { Zora } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const askFilled: EventData = {
  kind: "zora-ask-filled",
  addresses: { [Zora.Addresses.Exchange[config.chainId].toLowerCase()]: true },
  topic: "0x21a9d8e221211780696258a05c6225b1a24f428e2fd4d51708f1ab2be4224d39",
  numTopics: 4,
  abi: new Interface([
    `event AskFilled(
      address indexed tokenContract,
      uint256 indexed tokenId,
      address indexed buyer,
      address finder,
      (address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice) ask
    );`,
  ]),
};
