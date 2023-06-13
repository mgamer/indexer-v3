import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getConduits, saveConduit } from "../utils/seaport-conduit";

import { describe, it, expect } from "@jest/globals";

describe("Seaport Conduit", () => {
  it("save-conduit", async () => {
    const conduit = `0xc1167130d6a3D589dDD08c20AD69b480B30C4fbC`.toLowerCase();
    const conduitKey =
      `0xF984C55CA75735630C1C27D3D06969C1AA6AF1DF86D22DDC0E3A978AD6138E9F`.toLowerCase();
    const txHash = `0x1343691a9d0e81ad9a006b8218dc1640805d202438f1b8b12420ab74189ebaa6`;
    await saveConduit(conduit, conduitKey, txHash);
    const result = await getConduits([conduitKey]);
    expect(result.find((c) => c.conduitKey === conduitKey)).not.toBe(undefined);
  });
});
