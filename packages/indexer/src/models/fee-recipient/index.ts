import _ from "lodash";

import { idb, redb } from "@/common/db";
import { redis } from "@/common/redis";
import {
  FeeRecipientEntity,
  FeeRecipientEntityParams,
} from "@/models/fee-recipient/fee-recipient-entity";
import { default as entitiesFromJson } from "./feeRecipient.json";

export class FeeRecipient {
  private static instance: FeeRecipient;

  public feeRecipientsByAddress: { [address: string]: FeeRecipientEntity };

  private constructor() {
    this.feeRecipientsByAddress = {};
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const entitiesCache = await redis.get(FeeRecipient.getCacheKey());
    let entities: FeeRecipientEntityParams[];

    if (_.isNull(entitiesCache) || forceDbLoad) {
      // If no cache is available, then load from the database
      entities = await idb.manyOrNone(
        `
          SELECT
            fee_recipients.id,
            fee_recipients.domain,
            fee_recipients.address
          FROM fee_recipients
        `
      );
      await redis.set(FeeRecipient.getCacheKey(), JSON.stringify(entities), "EX", 60 * 60 * 24);
    } else {
      // Parse the data
      entities = JSON.parse(entitiesCache);
    }

    for (const entity of entities) {
      this.feeRecipientsByAddress[_.toLower(entity.address)] = new FeeRecipientEntity(entity);
    }
  }

  public static getCacheKey() {
    return "fee_recipients";
  }

  public static async getInstance() {
    if (!FeeRecipient.instance) {
      FeeRecipient.instance = new FeeRecipient();
      await FeeRecipient.instance.loadData();
    }

    return FeeRecipient.instance;
  }

  public static async forceDataReload() {
    if (FeeRecipient.instance) {
      await FeeRecipient.instance.loadData(true);
    }
  }

  public static async syncSources() {
    _.forEach(entitiesFromJson, (item, id) => {
      FeeRecipient.addFromJson(Number(id), item.domain, item.address);
    });
  }

  public static async addFromJson(id: number, domain: string | null, address: string) {
    try {
      await idb.none(
        `
        INSERT INTO fee_recipients(
          id,
          domain,
          address
        ) VALUES (
          $/id/,
          $/domain/,
          $/address/
        )
        ON CONFLICT (id) DO UPDATE SET
          domain = $/domain/
      `,
        {
          id,
          domain,
          address,
        }
      );
    } catch (error) {
      // Ignore errors when loading from JSON
    }
  }

  public async create(address: string, domain: string | null) {
    // It could be the entity already exist
    let entity = await redb.oneOrNone(
      `
      SELECT *
      FROM fee_recipients
      WHERE address = $/address/ AND domain = $/domain/
    `,
      {
        address,
        domain,
      }
    );

    if (entity) {
      return new FeeRecipientEntity(entity);
    }

    entity = await idb.oneOrNone(
      `
        INSERT INTO fee_recipients(
          domain,
          address
        ) VALUES (
          $/domain/,
          $/address/
        )
        ON CONFLICT (domain) DO UPDATE SET domain = EXCLUDED.domain
        RETURNING *
      `,
      {
        domain,
        address,
      }
    );

    // Reload the cache
    await FeeRecipient.instance.loadData(true);
    return new FeeRecipientEntity(entity);
  }

  public getByAddress(address: string): FeeRecipientEntity | undefined {
    let entity: FeeRecipientEntity | undefined;

    address = _.toLower(address);
    if (address in this.feeRecipientsByAddress) {
      entity = this.feeRecipientsByAddress[address];
    }
    return entity;
  }

  public async getOrInsert(address: string, domain: string): Promise<FeeRecipientEntity> {
    let entity: FeeRecipientEntity | undefined;
    entity = this.getByAddress(address);
    if (!entity) {
      entity = await this.create(address, domain);
    }

    return entity;
  }
}
