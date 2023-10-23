import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import { config } from "@/config/index";
import * as detector from "@/orderbook/mints/calldata/detector";

jest.setTimeout(1000 * 1000);

describe("Mints - Detector", () => {
  it("base-normal-case1", async () => {
    if (config.chainId != 8453) {
      return;
    }
    const txId = "0x13dcd467192096bbd652d934dd0d7a40581bc6d39d38d9e8a874e7a77151d732";
    const mints = await detector.extractByTx(txId);
    expect(mints.length).not.toBe(0);
  });
});
