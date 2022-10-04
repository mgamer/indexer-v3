import tracer from "dd-trace";
import { getServiceName } from "@/config/network";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });

  // Debug sending some header to X2Y2
  tracer.use("hapi", {
    headers: ["X-Api-Used-By"],
  });
}

export default tracer;
