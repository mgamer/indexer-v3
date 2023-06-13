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

  it("import-conduits", async () => {
    const conduits = [
      {
        conduit: "0x4a49e91a45Cb6cc4E083e86eD3A6d95fe7384461",
        conduitKey: "0x263C993863204130DADFAF0D8926FF32EA52DAE289469D60BF61720DCB9E4821",
        txHash: "0xc406cd91a776fa58b6f64010701f5f9c892955df9f2a05ff39fd4a6fd013bd2b",
      },
      {
        conduit: "0x9352dA82F42c5bDDe9F0b2C19D635baE39142dD8",
        conduitKey: "0xA8C94AE38B04140794A9394B76AC6D0A83AC0B02000000000000000000000000",
        txHash: "0xe5bbc588dfda93e988d233318dcab09d84df7fc6706afa66a1cb517ea777fdc8",
      },
      {
        conduit: "0xc1167130d6a3D589dDD08c20AD69b480B30C4fbC",
        conduitKey: "0xF984C55CA75735630C1C27D3D06969C1AA6AF1DF86D22DDC0E3A978AD6138E9F",
        txHash: "0x1343691a9d0e81ad9a006b8218dc1640805d202438f1b8b12420ab74189ebaa6",
      },
      {
        conduit: "0xd6Dfb8Fb4d117Dbf9d83e8d57BdA2d67c8CD4488",
        conduitKey: "0x31E9CC5FAA2CA95DD3EA25C7A6A14E30C02D139F000000000000000000000000",
        txHash: "0xe8bf27e4142368ec7c7a6aae71548f048132e670feb0b39e01e8604acf44a856",
      },
      {
        conduit: "0xcDEa48d73057d25Cf80EA13d9866907Df2f40dc4",
        conduitKey: "0xB9F312A053A074BC69BBAE4CAA423D74B1301CC6000000000000000000000000",
        txHash: "0xb5ceeed8cda5d5a430076b4c27c703eeee0d81322a6e0059aa43e0d32c364724",
      },
      {
        conduit: "0x961e5c5604984628Be546251438f4663697d60c1",
        conduitKey: "0xF94C9667295756F034D20382589E89C120204109000000000000000000001000",
        txHash: "0x330a6d2c1641bdea51322bb0dcda1166dcb45d238388a21cad4174fa40b1c038",
      },
      {
        conduit: "0xFbf166299d3C012de9efeC0240D12756C1f4c0Fc",
        conduitKey: "0xF3D63166F0CA56C3C1A3508FCE03FF0CF3FB691E000000000000000000000000",
        txHash: "0x4f47101a520ff654b71bbdcde2b9939c9900cbec490c1146c251fbc97638166f",
      },
      {
        conduit: "0x7897018b1cE161e58943C579AC3df50d89c3D4F4",
        conduitKey: "0x530387DBF7F794E3C32F5E033DBFC682F1952131000000000000000000000000",
        txHash: "0x2d3e5407a5bb1eb747c72f65d5b27e6cf83841efdea7ebbde3f11563d79070e7",
      },
      {
        conduit: "0x48875A3257FE0ff080CECcfF957023ca7253A5f8",
        conduitKey: "0x6474AB64045BF9B341812B42CBD1E09122B758FF000000000000000000000000",
        txHash: "0x979c39a7cf2bf66d3633c7d1036ab00ae36740b05178412a3a7de75098acffe7",
      },
    ];

    for (const { conduit, conduitKey, txHash } of conduits) {
      await saveConduit(conduit.toLowerCase(), conduitKey.toLowerCase(), txHash.toLowerCase());
    }
  });
});
