import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByCollection,
  extractCustomByCollection,
} from "../../orderbook/mints/calldata/detector/mintdotfun";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Mint.fun", () => {
  it("parse", async () => {
    const collection = `0x0000000000664ceffed39244a8312bD895470803`;
    const infos = await extractCustomByCollection(collection);
    expect(infos.length).not.toBe(0);
  });

  it("create", async () => {
    const collection = `0x3578234c0fd2d531e84eec84cabf64ff5b246c30`;
    const infos = await extractByCollection(
      collection,
      "0x000000000f30984DE6843bBC1d109c95EA6242ac"
    );
    expect(infos.length).not.toBe(0);
  });
});
