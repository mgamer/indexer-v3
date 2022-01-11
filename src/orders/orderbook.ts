import * as Sdk from "@reservoir0x/sdk";
import { gql, request } from "graphql-request";

import { arweaveGateway } from "@/common/provider";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

export const sync = async (
  fromBlock: number,
  toBlock: number
): Promise<Sdk.WyvernV2.Order[]> => {
  const orders: Sdk.WyvernV2.Order[] = [];

  const network = config.chainId === 1 ? "mainnet" : "rinkeby";
  const query = gql`
    {
      transactions(
        block: { min: ${fromBlock}, max: ${toBlock} }
        tags: [
          { name: "App-Name", values: ["reservoir-${network}"] },
          { name: "App-Version", values: ["0.0.1"]}
        ]
      ) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  const { protocol, host } = arweaveGateway.api.config;
  const data = await request(`${protocol}://${host}/graphql`, query);
  for (const { node } of data?.transactions?.edges ?? []) {
    const upstreamOrders = await arweaveGateway.transactions.getData(node.id, {
      decode: true,
      string: true,
    });

    logger.info(
      "orderbook_sync",
      `Data received: ${JSON.stringify(upstreamOrders, null, 2)}`
    );
  }

  return orders;
};
