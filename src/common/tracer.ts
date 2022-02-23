import tracer from "dd-trace";

import { network } from "@/common/provider";
import { config } from "@/config/index";

if (process.env.DATADOG_AGENT_URL) {
  const service = `indexer-${config.version}-${network}`;

  tracer.init({
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
