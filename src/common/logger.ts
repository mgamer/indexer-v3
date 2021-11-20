import { CoralogixLogger, Log, LoggerConfig, Severity } from "coralogix-logger";

import { config } from "../config";

const log = (severity: Severity) => {
  const coralogixPrivateKey = process.env.CORALOGIX_PRIVATE_KEY;
  if (coralogixPrivateKey) {
    const loggerConfig = new LoggerConfig({
      privateKey: String(coralogixPrivateKey),
      applicationName: "reservoir",
      subsystemName: `indexer-v3-${
        config.chainId === 1 ? "mainnet" : "rinkeby"
      }`,
    });
    CoralogixLogger.configure(loggerConfig);

    return (category: string, message: any) => {
      const logger = new CoralogixLogger(category);
      const log = new Log({
        severity,
        category,
        text: message,
      });
      logger.addLog(log);
    };
  } else {
    return (category: string, message: any) => {
      const timestamp = `[${new Date().toUTCString()}]`;
      console.log(timestamp, category, message);
    };
  }
};

export const logger = {
  debug: log(Severity.debug),
  error: log(Severity.error),
  info: log(Severity.info),
};
