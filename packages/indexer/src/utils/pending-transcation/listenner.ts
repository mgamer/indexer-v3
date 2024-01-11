import Websocket from "ws";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { PendingMessage } from "./types";
import { watchList } from "./constants";
import { baseProvider } from "@/common/provider";
import { pendingTranscationJob } from "@/jobs/pending-transcation/pending-transcation-job";

const COMPONENT = "pending-transcation-websocket";

export class PendingTxListenner {
  public websocket: Websocket;
  constructor() {
    const websocket = new Websocket("wss://api.blxrbdn.com/ws", {
      headers: {
        Authorization: config.bloxrouteAuth,
      },
    });
    websocket.on("open", () => {
      this.subscribe();
    });
    websocket.on("error", (error) => {
      logger.error(COMPONENT, `Error from Pending transcaton websocket: ${error}`);
    });
    this.websocket = websocket;
  }

  subscribe() {
    const params = {
      include: [
        "tx_hash",
        "tx_contents.input",
        "tx_contents.to",
        "tx_contents.from",
        "tx_contents.value",
      ],
      filters: `{to} IN ${JSON.stringify(watchList)}`,
    };

    const pendingTxQuuery = {
      jsonrpc: "2.0",
      id: 1,
      method: "subscribe",
      params: ["pendingTxs", params],
    };

    this.websocket.send(JSON.stringify(pendingTxQuuery));
  }

  listen(handler: (message: PendingMessage) => void) {
    this.websocket.on("message", async (msg) => {
      const parsed = this.parseMessage(msg);
      if (parsed) {
        if (handler) {
          handler(parsed);
        }
      }
    });
  }

  parseMessage(msg: Websocket.RawData): PendingMessage | undefined {
    const parsedMsg = JSON.parse(msg.toString());
    if (parsedMsg.params?.result) {
      const data = parsedMsg.params.result;
      return data;
    }
  }

  async getSamlePendingTx(
    filterFunc: (message?: PendingMessage) => boolean
  ): Promise<PendingMessage> {
    return new Promise((resolve) => {
      const listen = async (msg: Websocket.RawData) => {
        const parsed = this.parseMessage(msg);
        const matched = filterFunc(parsed);
        if (matched && parsed) {
          resolve(parsed);
          this.websocket.off("message", listen);
        }
      };
      this.websocket.on("message", listen);
    });
  }

  async watchTxCompleted(hash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = async () => {
        const recepient = await baseProvider.getTransactionReceipt(hash);
        if (recepient) {
          resolve(true);
        } else {
          setTimeout(() => check(), 2000);
        }
      };
      check();
    });
  }
}

export function startListenner() {
  const listenner = new PendingTxListenner();
  listenner.listen(async (message) => {
    await pendingTranscationJob.addToQueue([message]);
  });
}

if (config.doWebsocketWork) {
  logger.info(COMPONENT, `Start Pending transcaton listenner`);
  startListenner();
}
