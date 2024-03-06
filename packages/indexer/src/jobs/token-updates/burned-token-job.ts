/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";

export type BurnedTokenJobPayload = {
  contract: string;
  tokenId: string;
};

export default class BurnedTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "burned-token";
  maxRetries = 1;
  concurrency = 10;
  useSharedChannel = true;

  public async process(payload: BurnedTokenJobPayload) {
    const { contract, tokenId } = payload;

    const contractKind = await redb.oneOrNone(
      `SELECT kind FROM contracts WHERE address = $/address/`,
      { address: toBuffer(contract) }
    );

    // Process only erc721
    if (contractKind && contractKind.kind === "erc721") {
      const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

      if (collection) {
        await idb.none(
          `
          UPDATE collections SET
            token_count = GREATEST(token_count - 1, 0),
            updated_at = now()
          WHERE id = $/collection/
        `,
          {
            collection: collection.id,
          }
        );
      }

      const updateAttributesQuery = `
        UPDATE attributes SET
          token_count = GREATEST(token_count - 1, 0),
          updated_at = now()
        WHERE id IN (
          SELECT attributes.id
          FROM token_attributes ta
          JOIN attributes ON ta.attribute_id = attributes.id
          WHERE ta.contract = $/contract/
          AND ta.token_id = $/tokenId/
          AND ta.key != ''
        )
      `;

      await idb.none(updateAttributesQuery, { contract: toBuffer(contract), tokenId });
    }
  }

  public async addToQueue(tokens: BurnedTokenJobPayload[]) {
    await this.sendBatch(tokens.map((t) => ({ payload: t, jobId: `${t.contract}:${t.tokenId}` })));
  }
}

export const burnedTokenJob = new BurnedTokenJob();
