// Initialize all background job queues and crons.

import "@/jobs/arweave-relay";
import "@/jobs/arweave-sync";
import "@/jobs/backfill";
import "@/jobs/cache-check";
import "@/jobs/collection-updates";
import "@/jobs/events-sync";
import "@/jobs/fill-updates";
import "@/jobs/metadata-index";
import "@/jobs/order-fixes";
import "@/jobs/order-updates";
import "@/jobs/orderbook";
import "@/jobs/token-updates";
import "@/jobs/daily-volumes";
import "@/jobs/update-attribute";
import "@/jobs/collections-refresh";
import "@/jobs/nft-balance-updates";

// Export all job queues for monitoring through the UI.

import * as arweaveSyncBackfill from "@/jobs/arweave-sync/backfill-queue";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";
import * as backfillQueue from "@/jobs/backfill/token-floor-ask-events";
import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncBlockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncFtTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/ft-transfers";
import * as eventsSyncNftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import * as orderFixes from "@/jobs/order-fixes/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";
import * as tokenUpdatesMintQueue from "@/jobs/token-updates/mint-queue";
import * as tokenRefreshCacheQueue from "@/jobs/token-updates/token-refresh-cache";
import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";
import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";
import * as resyncAttributeCollection from "@/jobs/update-attribute/resync-attribute-collection";
import * as resyncAttributeFloorSell from "@/jobs/update-attribute/resync-attribute-floor-sell";
import * as resyncOrdersSource from "@/jobs/orderbook/resync-orders-source";
import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";
import * as backfillAcquiredAtQueue from "@/jobs/nft-balance-updates/backfill-acquired-at-queue";
import * as updateNftBalanceFloorAskPriceQueue from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as backfillNftBalanceFloorAskPriceQueue from "@/jobs/nft-balance-updates/backfill-floor-ask-price-queue";
import * as updateNftBalanceTopBidQueue from "@/jobs/nft-balance-updates/update-top-bid-queue";
import * as backfillNftBalanceTopBidQueue from "@/jobs/nft-balance-updates/backfill-top-bid-queue";

export const allJobQueues = [
  arweaveSyncBackfill.queue,
  arweaveSyncRealtime.queue,
  backfillQueue.queue,
  collectionUpdatesFloorAsk.queue,
  collectionUpdatesMetadata.queue,
  eventsSyncBackfill.queue,
  eventsSyncBlockCheck.queue,
  eventsSyncRealtime.queue,
  eventsSyncFtTransfersWriteBuffer.queue,
  eventsSyncNftTransfersWriteBuffer.queue,
  fillUpdates.queue,
  metadataIndexFetch.queue,
  metadataIndexProcess.queue,
  metadataIndexWrite.queue,
  orderFixes.queue,
  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
  orderbookOrders.queue,
  orderbookTokenSets.queue,
  tokenUpdatesMintQueue.queue,
  tokenRefreshCacheQueue.queue,
  dailyVolumes.queue,
  handleNewSellOrder.queue,
  handleNewBuyOrder.queue,
  resyncAttributeCache.queue,
  resyncOrdersSource.queue,
  resyncAttributeKeyCounts.queue,
  resyncAttributeValueCounts.queue,
  resyncAttributeCollection.queue,
  resyncAttributeFloorSell.queue,
  collectionsRefresh.queue,
  collectionsRefreshCache.queue,
  backfillAcquiredAtQueue.queue,
  updateNftBalanceFloorAskPriceQueue.queue,
  backfillNftBalanceFloorAskPriceQueue.queue,
  updateNftBalanceTopBidQueue.queue,
  backfillNftBalanceTopBidQueue.queue,
];
