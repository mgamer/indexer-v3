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
    const collection = `0x94D0719C34C337f4F4Dbc8862d4942043fE59b15`;
    const info = await Foundation.extractByCollectionERC721(collection);
    expect(info.length).not.toBe(0);
  });
});
