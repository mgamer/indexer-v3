import tracer from "dd-trace";

import { config } from "@/config/index";

if (process.env.DATADOG_AGENT_URL) {
  const network = config.chainId === 1 ? "mainnet" : "rinkeby";
  const service = `indexer-${config.version}-${network}`;

  tracer.init({
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
