import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractRoyalties } from "@/events-sync/handlers/royalties/core";
import { getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties";
import * as es from "@/events-sync/storage";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

type TestCase = {
  name: string;
  tx: string;
  //   royaltyFeeBps: number;
  //   marketplaceFeeBps: number;
};

describe("Royalties - Router normalize", () => {
  const testCollectionRoyalties = [
    {
      collection: "0x33c6eec1723b12c46732f7ab41398de45641fa42",
      data: [
        {
          recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
          bps: 750,
        },
      ],
    },
  ];
  const platformFees = [
    {
      kind: "x2y2",
      feeBps: 50,
    },
    {
      kind: "seaport",
      feeBps: 250,
    },
  ];

  const testFeeExtract = async (txHash: string) => {
    mockGetRoyalties.mockImplementation(async (contract: string) => {
      const matched = testCollectionRoyalties.find((c) => c.collection === contract);
      return matched?.data ?? [];
    });

    const fillEvents: es.fills.Event[] = await getFillEventsFromTx(txHash);
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const feeForPlatform = platformFees.find((_) => _.kind === fillEvent.orderKind);
      const fees = await extractRoyalties(fillEvent);

      const matched = testCollectionRoyalties.find((c) => c.collection === fillEvent.contract);
      if (matched) {
        expect(fees?.royaltyFeeBps).toEqual(matched.data[0].bps);
      }
      if (feeForPlatform) {
        // check
        expect(fees?.marketplaceFeeBps).toEqual(feeForPlatform.feeBps);
      }
    }
  };

  const txIds: TestCase[] = [
    {
      name: "reservoir-router-with-normalize",
      tx: "0xc422678f7e2c0efc8e140debed5a5f6a3f8061bb0ff02b701046876ff81dbe35",
    },
  ];

  for (const { name, tx } of txIds) {
    it(`${name}`, async () => testFeeExtract(tx));
  }
});
