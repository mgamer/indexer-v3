import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import { handleEvents } from "@/events-sync/handlers/blur";

describe("Blur", () => {
  test("BlurSwap - single-sale", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x9e4e8ba883e49c296c16f7c06b7f68244c5b916085afee05d24be6d2f02716ca"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    const maker = "0xb235ba58e93ba482b19e81d66eb001cd6ffd601b";
    const taker = "0xed2ab4948ba6a909a7751dec4f34f303eb8c7236";
    const fillEvent = result?.fillEvents?.find((c) => c.maker === maker && c.taker === taker);
    expect(fillEvent).not.toBe(null);
  });

  test("BlurSwap - multiple-sales", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x0abdd7ceddcb1f54c82a89e0d026fbd160c36ebfe155421443097d3c5cdc9bb2"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    const taker = "0x762172c3c9030e13fdaca2ee0de5b0d152ee604e";
    const maker1 = "0x88da8e5677dee90ffa14b307b2b16bce1a74c21d";
    const maker2 = "0xb99f2a6c6576a1e1b1cc6c787e3eff30d9fd9d44";

    const fillEvent1 = result?.fillEvents?.find((c) => c.maker === maker1 && c.taker === taker);
    const fillEvent2 = result?.fillEvents?.find((c) => c.maker === maker2 && c.taker === taker);

    expect(fillEvent1).not.toBe(null);
    expect(fillEvent2).not.toBe(null);
  });
});
