import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export enum ActionsOrigin {
  DailyProcess = "daily-process",
  CollectionRefresh = "collection-refresh",
  API = "api",
}

export enum ActionsContext {
  SpamContractUpdate = "spam-contract-update",
  SpamCollectionUpdate = "spam-collection-update",
  SpamTokenUpdate = "spam-token-update",
  DisableMetadataUpdate = "disable-metadata-update",
}

export type ActionsTrackingJobPayload = {
  context: ActionsContext;
  origin: ActionsOrigin;
  actionTakerIdentifier: string;
  contract?: string;
  collection?: string;
  tokenId?: string;
  data?: object;
};

export class ActionsTrackingJob extends AbstractRabbitMqJobHandler {
  queueName = "actions-tracking";
  maxRetries = 10;
  concurrency = 10;
  lazyMode = true;

  protected async process(payload: ActionsTrackingJobPayload) {
    const { context, origin, actionTakerIdentifier, contract, collection, tokenId, data } = payload;

    await idb.none(
      `
        INSERT INTO actions_tracking (
          context,
          origin,
          action_taker_identifier,
          contract,
          collection_id,
          token_id,
          data
        ) VALUES (
          $/context/,
          $/origin/,
          $/actionTakerIdentifier/,
          $/contract/,
          $/collection/,
          $/tokenId/,
          $/data:json/
        )
        `,
      {
        context,
        origin,
        actionTakerIdentifier,
        contract: contract ? toBuffer(contract) : null,
        collection: collection ?? null,
        tokenId: tokenId ?? null,
        data: data ?? {},
      }
    );
  }

  public async addToQueue(params: ActionsTrackingJobPayload[]) {
    await this.sendBatch(params.map((p) => ({ payload: p })));
  }
}

export const actionsTrackingJob = new ActionsTrackingJob();
