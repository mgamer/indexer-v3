import tracer from "dd-trace";

import { config } from "@/config/index";
import { getNetworkName } from "@/common/utils";

if (process.env.DATADOG_AGENT_URL) {
  const service = `indexer-${config.version}-${getNetworkName()}`;

  tracer.init({
    profiling: true,
    env: config.chainId === 1 ? "prod" : "dev",
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
