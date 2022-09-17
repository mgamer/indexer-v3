import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { getEventData } from "@/events-sync/data";
import { TransactionReceipt, Log } from "@ethersproject/abstract-provider";

export function getEventParams(log: Log) {
  const address = log.address.toLowerCase() as string;
  const block = log.blockNumber as number;
  const blockHash = log.blockHash.toLowerCase() as string;
  const txHash = log.transactionHash.toLowerCase() as string;
  const txIndex = log.transactionIndex as number;
  const logIndex = log.logIndex as number;
  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp: Math.floor(Date.now() / 1000),
    batchIndex: 1,
  };
}

export function getEventsFromTx(tx: TransactionReceipt) {
  const enhancedEvents: EnhancedEvent[] = [];
  const availableEventData = getEventData();
  for (let index = 0; index < tx.logs.length; index++) {
    const log = tx.logs[index];
    const eventData = availableEventData.find(
      ({ addresses, topic, numTopics }) =>
        log.topics[0] === topic &&
        log.topics.length === numTopics &&
        (addresses ? addresses[log.address.toLowerCase()] : true)
    );
    if (eventData) {
      enhancedEvents.push({
        kind: eventData.kind,
        baseEventParams: getEventParams(log),
        log,
      });
    }
  }
  return enhancedEvents;
}
