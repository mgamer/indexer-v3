import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

// There are some NFTs which do not strictly adhere to the ERC721
// standard (eg. Cryptovoxels) but it would still be good to have
// support for them. We should have custom rules for these.

export const transfer: EventData = {
  kind: "erc721-transfer",
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 4,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 indexed tokenId
    )`,
  ]),
};
