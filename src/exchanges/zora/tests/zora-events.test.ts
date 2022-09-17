import { config as dotEnvConfig } from "dotenv";

dotEnvConfig();

import { baseProvider } from "@/common/provider";
import allTx from "../__fixtures__/tx";

import { getEventsFromTx } from "../../utils/test";
import { handleEvents } from "../handler";
import { processOnChainData } from "@/events-sync/handlers/utils";

jest.setTimeout(30000);

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
    const result = await handleEvents(createEvents.concat(events));
    // expect(result.cancelEventsOnChain?.length).toEqual(1);
    await processOnChainData(result);
  });

  test("order-cancel", async () => {
    const cancelAsk = await baseProvider.getTransactionReceipt(allTx.cancelAskTx);
    const events = getEventsFromTx(cancelAsk);
    const result = await handleEvents(events);
    // await processOnChainData(result);
    expect(result.cancelEventsOnChain?.length).toEqual(1);
    expect(result.orderInfos?.filter((_) => _.context.startsWith("cancel")).length).toEqual(1);
    // if (result.orders?.length) {
    //   console.log(result.orders[0])
    // }
    // console.log(result)
  });

  test("order-update", async () => {
    const setAskCreateTx = await baseProvider.getTransactionReceipt(allTx.setAskCreateTx);
    const setAskTx = await baseProvider.getTransactionReceipt(allTx.setAskTx);
    const eventsCreate = getEventsFromTx(setAskCreateTx);
    const eventsSet = getEventsFromTx(setAskTx);
    const result = await handleEvents(eventsCreate.concat(eventsSet));
    expect(result.orderInfos?.filter((_) => _.context.startsWith("reprice")).length).toEqual(1);
  });
});
