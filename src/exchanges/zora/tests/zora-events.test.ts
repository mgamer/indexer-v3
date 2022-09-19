import { config as dotEnvConfig } from "dotenv";

dotEnvConfig();

import { baseProvider } from "@/common/provider";
import allTx from "../__fixtures__/tx";

import { getEventsFromTx } from "../../utils/test";
import { handleEvents } from "../handler";
import { processOnChainData } from "@/events-sync/handlers/utils";

jest.setTimeout(50000);

describe("ZoraEvent", () => {
  test("order", async () => {
    const tx = await baseProvider.getTransactionReceipt(allTx.createAskTx);
    const events = getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.orders?.length).toEqual(1);
  });

  test("order-save-cancel", async () => {
    const groupCreateTx = await baseProvider.getTransactionReceipt(allTx.cancelAskCreateTx);
    const cancelAsk = await baseProvider.getTransactionReceipt(allTx.cancelAskTx);
    const createEvents = getEventsFromTx(groupCreateTx);
    const events = getEventsFromTx(cancelAsk);
    const createResult = await handleEvents(createEvents);
    const cancelAskResult = await handleEvents(events);
    // expect(result.cancelEventsOnChain?.length).toEqual(1);
    await processOnChainData(createResult);
    await new Promise((resolve) => {
      setTimeout(resolve, 3 * 1000);
    });
    await processOnChainData(cancelAskResult);
  });

  test("order-update", async () => {
    const setAskCreateTx = await baseProvider.getTransactionReceipt(allTx.setAskCreateTx);
    const setAskTx = await baseProvider.getTransactionReceipt(allTx.setAskTx);
    const eventsCreate = getEventsFromTx(setAskCreateTx);
    const eventsSet = getEventsFromTx(setAskTx);
    const result1 = await handleEvents(eventsCreate);
    const result2 = await handleEvents(eventsSet);
    // expect(result.orders?.length).toEqual(2);
    await processOnChainData(result1);
    await new Promise((resolve) => {
      setTimeout(resolve, 3 * 1000);
    });
    await processOnChainData(result2);
  });
});
