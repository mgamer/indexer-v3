import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
// import { LooksRareV2 } from "@reservoir0x/sdk";
import { config } from "@/config/index";
// import { OrderInfo } from "@/orderbook/orders/blur";
// import { initOnChainData, processOnChainData } from "@/events-sync/handlers/utils";
import {
  jest,
  describe,
  // it, expect
} from "@jest/globals";
// import { getOrder } from "tests/utils/order";
// import { getEnhancedEventsFromTx } from "@/events-sync/handlers/royalties/utils";
// import * as looksRareV2 from "@/events-sync/data/looks-rare-v2";

jest.setTimeout(1000 * 1000);

describe("LookRareV2", () => {
  const chainId = config.chainId;

  test("order-saving", async () => {
    if (chainId == 1) {
      return;
    }
    // const rawData = `0x9a1fc3a70000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000038000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bacee62d7acadd0ae2b3a3a5a674f97671659ce51c9c292ac4a4c2193b3a0891042c94a13168ff144eb30131161d8b0aabb588296d5db1713ce58fd480d3bf09700000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000f26fdf000000000000000000000000f65d928d8c143e49096cf666095a2be54bd431eb000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000005da517b1bf9999b7762eaefa8372341a1a475590000000000000000000000000000000000000000000000000000000000001668000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000917070797e18000000000000000000000000000000000000000000000000000000000006362a59800000000000000000000000000000000000000000000000000000000638a329800000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000053cae46abac64a5d1dc3a8ad0746b5c00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001d89573ca21c1878c2b55da13ef170bbcd599defb26a6e277239b686e38bb1e1900000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f26fdf00000000000000000000000000fb2499403afeccd48f0fb29da41cde8c113d4b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000005da517b1bf9999b7762eaefa8372341a1a475590000000000000000000000000000000000000000000000000000000000001668000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000917070797e180000000000000000000000000000000000000000000000000000000000063636fa90000000000000000000000000000000000000000000000000000000063638bc900000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000002d01851a2889aa9cb3ccd62f4322510e00000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`;
    // const exchange = new Blur.Exchange(config.chainId);
    // const builder = new Blur.Builders.SingleToken(config.chainId);
    // const inputData = exchange.contract.interface.decodeFunctionData("execute", rawData);

    // const sellInput = inputData.sell;
    // const sellOrder = sellInput.order;

    // const order = builder.build({
    //   side: sellOrder.side === 1 ? "sell" : "buy",
    //   trader: sellOrder.trader,
    //   collection: sellOrder.collection,
    //   tokenId: sellOrder.tokenId.toString(),
    //   amount: sellOrder.amount.toString(),
    //   paymentToken: sellOrder.paymentToken,
    //   price: sellOrder.price.toString(),
    //   listingTime: sellOrder.listingTime.toString(),
    //   matchingPolicy: sellOrder.matchingPolicy,
    //   nonce: 0,
    //   expirationTime: sellOrder.expirationTime.toString(),
    //   fees: sellOrder.fees.map((_: { recipient: string; rate: number }) => {
    //     return {
    //       rate: _.rate,
    //       recipient: _.recipient,
    //     };
    //   }),
    //   salt: sellOrder.salt.toString(),
    //   extraParams: sellOrder.extraParams,
    //   r: sellInput.r,
    //   v: sellInput.v,
    //   s: sellInput.s,
    //   extraSignature: sellInput.extraSignature,
    //   signatureVersion: sellInput.signatureVersion,
    //   blockNumber: sellInput.blockNumber.toString(),
    // });

    // await saveContract(sellOrder.collection.toLowerCase(), "erc721");

    // // Store orders
    // const orders: OrderInfo[] = [];
    // orders.push({
    //   orderParams: order.params,
    //   metadata: {},
    // });

    // const onChainData = initOnChainData();
    // onChainData.orders = orders.map((info) => ({
    //   kind: "blur",
    //   info,
    // }));
    // await processOnChainData(onChainData);

    // const orderInDb = await getOrder(
    //   "0x71ba349119ef6685a84da0ccd810ec3070345608fe981619f071ad268b499eba"
    // );

    // await wait(20 * 1000);
    // expect(orderInDb).not.toBe(null);
  });

  test("events", async () => {
    // const topics =
    // console.log("looksRareV2", {
    //   takerAsk: looksRareV2.takerAsk.abi.getEventTopic("TakerAsk"),
    //   takerBid: looksRareV2.takerBid.abi.getEventTopic("TakerBid"),
    //   newBidAskNonces: looksRareV2.newBidAskNonces.abi.getEventTopic("NewBidAskNonces"),
    //   orderNoncesCancelled:
    //     looksRareV2.orderNoncesCancelled.abi.getEventTopic("OrderNoncesCancelled"),
    //   subsetNoncesCancelled:
    //     looksRareV2.subsetNoncesCancelled.abi.getEventTopic("SubsetNoncesCancelled"),
    //   // takerAsk: looksRareV2.takerAsk.getEventTopic('TakerAsk'),
    //   // takerAsk: looksRareV2.takerAsk.getEventTopic('TakerAsk'),
    // });
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x567d3d9cc5f4f642c9c4711d375b439f0efdf98033545a05d5bb161669a8f976"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // expect(result.cancelEvents?.length).toEqual(1);
  });

  test("testSell", async () => {
    // if (chainId == 1) {
    //   return;
    // }
    // // testnet
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x7d395ee0df1ed8c81a19d11ada7273a64fe41dee7cb899ecf8fd52a3d1db8240"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // expect(result.cancelEventsOnChain?.length).toEqual(1);
  });

  test("testBuy", async () => {
    // if (chainId == 1) {
    //   return;
    // }
    // // testnet
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x1c2e4477085dfc71402b8beab6ffe42423b877b773cb48c14c8b7c3d1f17b3dd"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // expect(result.cancelEventsOnChain?.length).toEqual(1);
  });
});
