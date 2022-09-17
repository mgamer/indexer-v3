import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import createAsk from "../__fixtures__/create-ask";
import cancelAsk, { groupCreateTx } from "../__fixtures__/cancel-ask";
import setAskPrice from "../__fixtures__/set-ask-price";

import { getEventsFromTx } from "../../utils/test";
import { handleEvents } from "../handler";
import { processOnChainData } from "@/events-sync/handlers/utils";

jest.setTimeout(30000);

describe("ZoraEvent", () => {
  test("order", async () => {
    const events = getEventsFromTx(createAsk);
    const result = await handleEvents(events);
    expect(result.orders?.length).toEqual(1);
  });

  test("order-save-cancel", async () => {
    const createEvents = getEventsFromTx(groupCreateTx);
    const events = getEventsFromTx(cancelAsk);
    const result = await handleEvents(createEvents.concat(events));
    // expect(result.cancelEventsOnChain?.length).toEqual(1);
    await processOnChainData(result);
  });

  test("order-cancel", async () => {
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
    const events = getEventsFromTx(setAskPrice);
    const result = await handleEvents(events);
    expect(result.orderInfos?.filter((_) => _.context.startsWith("reprice")).length).toEqual(1);
  });
});
