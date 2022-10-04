import tracer from "dd-trace";

import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

if (process.env.DATADOG_AGENT_URL) {
  const isRailway = config.railwayStaticUrl !== "";
  const service = `indexer-${isRailway ? "" : "fc-"}${config.version}-${getNetworkName()}`;

  tracer.init({
    profiling: true,
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });

  // Debug sending some header to X2Y2
  tracer.use("http", {
    client: {
      headers: ["X-Api-Used-By"],
    },
  });
}

export default tracer;
