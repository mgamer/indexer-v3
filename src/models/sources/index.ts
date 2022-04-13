/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { randomBytes } from "crypto";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";
import { AddressZero } from "@ethersproject/constants";

import { default as sourcesFromJson } from "./sources.json";

export class Sources {
  private static instance: Sources;

  public sources: object;
  public sourcesByNames: object;
  public sourcesByAddress: object;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.sources = {};
    this.sourcesByNames = {};
    this.sourcesByAddress = {};
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const sourcesCache = await redis.get(Sources.getCacheKey());
    let sources: SourcesEntityParams[];

    if (_.isNull(sourcesCache) || forceDbLoad) {
      // If no cache load from DB
      sources = await idb.manyOrNone(`SELECT * FROM sources_v2`);
      await redis.set(Sources.getCacheKey(), JSON.stringify(sources), "EX", 60 * 60 * 24);
    } else {
      // Parse the cache data
      sources = JSON.parse(sourcesCache);
    }

    for (const source of sources) {
      (this.sources as any)[source.id] = new SourcesEntity(source);
      (this.sourcesByNames as any)[_.lowerCase(source.name)] = new SourcesEntity(source);
      (this.sourcesByAddress as any)[_.lowerCase(source.address)] = new SourcesEntity(source);
    }
  }

  public static getCacheKey() {
    return "sources";
  }

  public static async getInstance() {
    if (!this.instance) {
      this.instance = new Sources();
      await this.instance.loadData();
    }

    return this.instance;
  }

  public static getDefaultSource(): SourcesEntity {
    return new SourcesEntity({
      id: 0,
      address: AddressZero,
      name: "Reservoir",
      metadata: {
        icon: "https://www.reservoir.market/reservoir.svg",
        urlMainnet: "https://www.reservoir.market/collections/${contract}/${tokenId}",
        urlRinkeby: "https://www.reservoir.fun/collections/${contract}/${tokenId}",
      },
    });
  }

  public static async syncSources() {
    _.forEach(sourcesFromJson, (item, id) => {
      Sources.addFromJson(Number(id), item.name, item.address, item.data);
    });
  }

  public static async addFromJson(id: number, name: string, address: string, metadata: object) {
    const query = `INSERT INTO sources_v2 (id, name, address, metadata)
                   VALUES ($/id/, $/name/, $/address/, $/metadata:json/)
                   ON CONFLICT (id) DO UPDATE
                   SET metadata = $/metadata:json/, name = $/name/`;

    const values = {
      id,
      name,
      address,
      metadata,
    };

    await idb.none(query, values);
  }

  public async create(name: string, address: string, metadata: object = {}) {
    const query = `INSERT INTO sources_v2 (name, address, metadata)
                   VALUES ($/name/, $/address/, $/metadata:json/)
                   ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                   RETURNING *`;

    const values = {
      name,
      address,
      metadata,
    };

    const source = await idb.oneOrNone(query, values);
    const sourcesEntity = new SourcesEntity(source);

    await Sources.instance.loadData(true); // reload the cache

    (this.sources as any)[source.id] = sourcesEntity;
    (this.sourcesByNames as any)[source.name] = sourcesEntity;
    (this.sourcesByAddress as any)[source.address] = sourcesEntity;

    return sourcesEntity;
  }

  public get(id: number) {
    let sourceEntity;

    if (id in this.sources) {
      sourceEntity = (this.sources as any)[id];
    } else {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByName(name: string, returnDefault = true) {
    let sourceEntity;

    if (_.lowerCase(name) in this.sourcesByNames) {
      sourceEntity = (this.sourcesByNames as any)[_.lowerCase(name)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByAddress(address: string, contract?: string, tokenId?: string, returnDefault = true) {
    let sourceEntity;

    if (_.lowerCase(address) in this.sourcesByAddress) {
      sourceEntity = (this.sourcesByAddress as any)[_.lowerCase(address)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    if (sourceEntity) {
      if (config.chainId == 1) {
        if (sourceEntity.metadata.urlMainnet && contract && tokenId) {
          sourceEntity.metadata.url = _.replace(
            sourceEntity.metadata.urlMainnet,
            "${contract}",
            contract
          );

          sourceEntity.metadata.url = _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
        }
      } else {
        if (sourceEntity.metadata.urlRinkeby && contract && tokenId) {
          sourceEntity.metadata.url = _.replace(
            sourceEntity.metadata.urlRinkeby,
            "${contract}",
            contract
          );

          sourceEntity.metadata.url = _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
        }
      }
    }

    return sourceEntity;
  }

  public async getOrInsert(source: string) {
    let sourceEntity;

    if (source.match(/^0x[a-fA-F0-9]{40}$/)) {
      sourceEntity = this.getByAddress(source, undefined, undefined, false); // This is an address

      if (!sourceEntity) {
        sourceEntity = await this.create(source, source);
      }
    } else {
      sourceEntity = this.getByName(source, false); // This is a name

      if (!sourceEntity) {
        const address = "0x" + randomBytes(20).toString("hex");
        sourceEntity = await this.create(source, address);
      }
    }

    return sourceEntity;
  }
}
