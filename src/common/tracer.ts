import tracer from "dd-trace";
import { getServiceName } from "@/config/network";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
