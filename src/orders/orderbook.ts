import * as Sdk from "@reservoir0x/sdk";
import { gql, request } from "graphql-request";

import { arweaveGateway } from "@/common/provider";
import { config } from "@/config/index";

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
          { name: "App-Name", values: ["Reservoir Protocol"] },
          { name: "App-Version", values: ["0.0.1"] },
          { name: "Network", values: ["${network}"] }
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
    try {
      const upstreamData = JSON.parse(
        (await arweaveGateway.transactions.getData(node.id, {
          decode: true,
          string: true,
        })) as string
      );
      for (const data1 of upstreamData) {
        if (data1.kind === "order") {
          if (data1.data.kind === "wyvern-v2") {
            orders.push(
              new Sdk.WyvernV2.Order(config.chainId, data1.data.data)
            );
          }
        }
      }
    } catch {}
  }

  return orders;
};
