/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { config } from "@/config/index";
import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";
import { AddressZero } from "@ethersproject/constants";

import { default as sources } from "./sources.json";

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

  private async loadData() {
    const sources: SourcesEntityParams[] | null = await idb.manyOrNone(`SELECT * FROM sources_v2`);

    for (const source of sources) {
      (this.sources as any)[source.id] = new SourcesEntity(source);
      (this.sourcesByNames as any)[source.metadata.name] = new SourcesEntity(source);
      (this.sourcesByAddress as any)[source.metadata.address] = new SourcesEntity(source);
    }
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
      metadata: {
        address: AddressZero,
        name: "Reservoir",
        icon: "https://www.reservoir.market/reservoir.svg",
        urlMainnet: "https://www.reservoir.market/collections/${contract}/${tokenId}",
        urlRinkeby: "https://www.reservoir.fun/collections/${contract}/${tokenId}",
      },
    });
  }

  public static async syncSources() {
    _.forEach(sources, (metadata, id) => {
      Sources.add(Number(id), metadata);
    });
  }

  public static async add(id: number, metadata: object) {
    const query = `INSERT INTO sources_v2 (id, name, metadata)
                   VALUES ( $/id/, $/name/, $/metadata:json/)
                   ON CONFLICT (id) DO UPDATE
                   SET metadata = $/metadata:json/, name = $/name/`;

    const values = {
      id,
      name: (metadata as any).name,
      metadata: metadata,
    };

    await idb.none(query, values);
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

  public getByName(name: string) {
    let sourceEntity;

    if (name in this.sourcesByNames) {
      sourceEntity = (this.sourcesByNames as any)[name];
    } else {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByAddress(address: string, contract?: string, tokenId?: string) {
    let sourceEntity;

    if (address in this.sourcesByAddress) {
      sourceEntity = (this.sourcesByAddress as any)[address];
    } else {
      sourceEntity = Sources.getDefaultSource();
    }

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

    return sourceEntity;
  }

  public async set(id: string, metadata: object) {
    const query = `UPDATE sources_v2
                   SET metadata = $/metadata:json/
                   WHERE id = $/id/`;

    const values = {
      id,
      metadata: metadata,
    };

    await idb.none(query, values);
  }
}
