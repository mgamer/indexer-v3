/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { BigNumber } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import axios from "axios";

const BASE_URL = "https://api.reservoir.tools";

const { TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;
const SIMULATE_URL = `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`;

const main = async () => {
  const taker = "0x0000000000000000000000000000000000000001";

  const collections = [
    // Doodles
    ["0x8a90cab2b38dba80c64b7734e58ee1db38b8992e", "erc721"],
    // Ragnarok Meta
    ["0x497a9a79e82e6fc0ff10a16f6f75e6fcd5ae65a8", "erc1155"],
  ];

  for (const [collection, kind] of collections) {
    // Get the floor token of the collection.
    const { tokens }: { tokens: any } = await axios
      .get(`${BASE_URL}/tokens/v4?collection=${collection}&limit=1`)
      .then(({ data }) => data);

    for (const { contract, tokenId } of tokens) {
      // Generate buy transaction.
      const { steps }: { steps: any } = await axios
        .get(
          `${BASE_URL}/execute/buy/v1?token=${contract}:${tokenId}&taker=${taker}&skipBalanceCheck=true`
        )
        .then(({ data }) => data);
      const tx = steps[0].data;

      // Simulate the buy transaction.
      const simulation = await axios.post(
        SIMULATE_URL,
        {
          network_id: "1",
          from: tx.from,
          to: tx.to,
          input: tx.data,
          value: BigNumber.from(tx.value).toString(),
          gas_price: "0",
          gas: 1000000,
          state_objects: {
            [taker]: { balance: BigNumber.from(tx.value).add(parseEther("1")).toString() },
          },
        },
        {
          headers: {
            "X-Access-Key": TENDERLY_ACCESS_KEY as string,
          },
        }
      );

      let hasTransfer = false;
      for (const { name, inputs } of (simulation.data as any).transaction.transaction_info.logs) {
        if (kind === "erc721" && name === "Transfer" && inputs[1].value === taker) {
          hasTransfer = true;
        } else if (kind === "erc1155" && name === "TransferSingle" && inputs[2].value === taker) {
          hasTransfer = true;
        }
      }

      if (!hasTransfer) {
        console.error("NO TRANSFER");
      } else {
        console.log("SUCCESS");
      }
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
