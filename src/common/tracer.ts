import tracer from "dd-trace";

import { config } from "@/config/index";

if (process.env.DATADOG_AGENT_URL) {
  const service = `indexer-${config.version}-${config.chainId === 1 ? "mainnet" : "rinkeby"}`;

  tracer.init({
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
