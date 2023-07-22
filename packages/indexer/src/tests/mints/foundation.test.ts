import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Foundation from "../../orderbook/mints/calldata/detector/foundation";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Foundation", () => {
  it("public-sale", async () => {
    const collection = `0x5959cddbe6b96afb19014fd77735a784f3e99a5f`;
    const info = await Foundation.extractByCollectionERC721(collection);
    expect(info.length).not.toBe(0);
  });

  it("allowlist-sale", async () => {
    const collection = `0xb951d97f3122f0423b8b5082e1101e94f38e6`;
    const info = await Foundation.extractByCollectionERC721(collection);
    expect(info.length).not.toBe(0);
  });
});
