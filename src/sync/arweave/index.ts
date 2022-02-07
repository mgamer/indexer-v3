import { gql, request } from "graphql-request";

import * as v001 from "@/arweave-sync/common/v001";
import { arweaveGateway } from "@/common/provider";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

type Transaction = {
  version: string;
  id: string;
};

type ArweaveSyncResult = {
  lastCursor?: string;
  done: boolean;
  transactions: Transaction[];
};

export const syncArweave = async (options?: {
  fromBlock?: number;
  toBlock?: number;
  afterCursor?: string;
}): Promise<ArweaveSyncResult> => {
  const transactions: Transaction[] = [];

  const batchSize = 100;
  const network = config.chainId === 1 ? "mainnet" : "rinkeby";

  // https://gist.github.com/TheLoneRonin/08d9fe4a43486815c78d6bebb2da4fff
  const { fromBlock, toBlock, afterCursor } = options || {};
  const query = gql`
    {
      transactions(
        tags: [
          { name: "App-Name", values: ["Reservoir Protocol"] },
          { name: "Network", values: ["${network}"] }
        ]
        first: ${batchSize}
        sort: HEIGHT_ASC
        ${
          fromBlock && toBlock
            ? `block: { min: ${fromBlock}, max: ${toBlock} }`
            : fromBlock
            ? `block: { min: ${fromBlock} }`
            : toBlock
            ? `block: { max: ${toBlock} }`
            : ""
        }
        ${afterCursor ? `after: "${afterCursor}"` : ""}
      ) {
        edges {
          cursor
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }
  `;

  const { protocol, host } = arweaveGateway.api.config;
  const data = await request(`${protocol}://${host}/graphql`, query);

  const results: {
    cursor: string;
    node: {
      id: string;
      tags: {
        name: string;
        value: string;
      }[];
    };
  }[] = data?.transactions?.edges ?? [];

  let lastCursor: string | undefined;
  if (results.length) {
    lastCursor = results[results.length - 1].cursor;
  }

  for (const { node } of results) {
    try {
      const version = node.tags.find((t) => t.name === "App-Version")?.value;
      if (!version) {
        // Skip unversioned transactions
        continue;
      }

      const transactionData = JSON.parse(
        (await arweaveGateway.transactions.getData(node.id, {
          decode: true,
          string: true,
        })) as string
      );

      switch (version) {
        case "0.0.1": {
          await v001.processTransactionData(transactionData);
          break;
        }

        default: {
          logger.info("sync-arweave", `Unrecognized version ${version}`);
          break;
        }
      }
    } catch {
      // Ignore any errors
    }
  }

  return {
    lastCursor,
    done: results.length < batchSize,
    transactions,
  };
};
