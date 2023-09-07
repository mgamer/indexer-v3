import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { bn } from "@/common/utils";
import { jest, describe, it, expect } from "@jest/globals";
import {
  saveGasEstimations,
  getGasEstimations,
  lookupEstimation,
  processGasEstimation,
  getTotalEstimateGas,
} from "../../utils/gas-estimation";

jest.setTimeout(1000 * 1000);

describe("Gas Estimation", () => {
  it("save-and-query", async () => {
    const sampleData = [
      {
        id: "0x42f6765ff932b6a089d6dcc61b67e63b7d29a64c46f59b8a614508c971c18b72",
        tagId: "0xeea1ac773a0a456661cf9e24a162f0d6ec5749156eb2e771f8f8f9c2e01df0f0",
        tags: [
          "fill-listings",
          "router",
          "module-0x2a00147dab6491186ea66fcaa3487aa3d9604e2f",
          "method-0x76af6629",
          "seaport-v1.1",
          "with-fees-4",
        ],
        gas: "245066",
        gasPrice: "4733114056",
        gasValue: "1159925329247696",
      },
      {
        id: "0x106fadc16b6a5e77c824fba60e0441d75511f87958728ca1924bd7ad1c3bb8ea",
        tagId: "0xeea1ac773a0a456661cf9e24a162f0d6ec5749156eb2e771f8f8f9c2e01df0f0",
        tags: [
          "fill-listings",
          "router",
          "module-0x2a00147dab6491186ea66fcaa3487aa3d9604e2f",
          "method-0x76af6629",
          "seaport-v1.1",
          "with-fees-4",
        ],
        gas: "245066",
        gasPrice: "4733114056",
        gasValue: "1159925329247696",
      },
    ];

    await saveGasEstimations(sampleData);

    const byTags = await getGasEstimations(["fill-listings", "router"], "tags");

    const byId = await getGasEstimations(
      ["0xeea1ac773a0a456661cf9e24a162f0d6ec5749156eb2e771f8f8f9c2e01df0f0"],
      "tagId"
    );

    const estimation = await lookupEstimation(sampleData[0].tags);

    expect(estimation).not.toBe(undefined);
    expect(byId.length).not.toBe(0);
    expect(byTags.length).not.toBe(0);
  });

  it("process", async () => {
    const txTags = ["fill-listings", "router"];
    await processGasEstimation([
      {
        txTags,
        txData: {
          from: "0x5124fcC2B3F99F571AD67D075643C743F38f1C34",
          to: "0xe688b84b23f322a994A53dbF8E15FA82CDB71127",
          data: "0x",
        },
      },
    ]);

    const estimation = await lookupEstimation(txTags);
    expect(estimation).not.toBe(undefined);
  });

  it("compute", async () => {
    const txTags = ["fill-listings", "router"];
    const testTranscations = [
      {
        txTags,
        txData: {
          from: "0x5124fcC2B3F99F571AD67D075643C743F38f1C34",
          to: "0xe688b84b23f322a994A53dbF8E15FA82CDB71127",
          data: "0x",
        },
      },
      {
        txTags: ["fill-listings", "test"],
        txData: {
          from: "0x5124fcC2B3F99F571AD67D075643C743F38f1C34",
          to: "0xe688b84b23f322a994A53dbF8E15FA82CDB71127",
          data: "0x",
        },
      },
    ];
    const { totalEstimateGas, missingTranscations } = await getTotalEstimateGas(testTranscations);

    if (missingTranscations.length) {
      await processGasEstimation(missingTranscations);
      const newResult = await getTotalEstimateGas(testTranscations);
      expect(newResult.totalEstimateGas).toBe(bn(totalEstimateGas).mul(2).toString());
    }
  });
});
