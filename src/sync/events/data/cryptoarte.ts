import { Interface } from "@ethersproject/abi";
import { CryptoArte } from "@reservoir0x/sdk";
import { EventData } from "@/events-sync/data";
import { config } from "@/config/index";

export const transfer: EventData = {
  kind: "cryptoarte-transfer",
  addresses: { [CryptoArte.Addresses.Contract[config.chainId]?.toLowerCase()]: true },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 tokenId
    )`,
  ]),
};
