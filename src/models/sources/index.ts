/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { config } from "@/config/index";
import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";

// import { default as sources } from "./sources.json";

export class Sources {
  private static instance: Sources;

  public sources: object;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.sources = {};
  }

  private async loadData() {
    const sources: SourcesEntityParams[] | null = await idb.manyOrNone(`SELECT * FROM sources`);

    for (const source of sources) {
      (this.sources as any)[source.source_id] = new SourcesEntity(source);
    }
  }

  public static async getInstance() {
    if (!this.instance) {
      this.instance = new Sources();
      await this.instance.loadData();
    }

    return this.instance;
  }

  public static getDefaultSource(sourceId: string): SourcesEntity {
    return new SourcesEntity({
      source_id: sourceId,
      metadata: {
        id: sourceId,
        name: "Reservoir",
        icon: "https://www.reservoir.market/reservoir.svg",
        urlMainnet: "https://www.reservoir.market/collections/${contract}/${tokenId}",
        urlRinkeby: "https://www.reservoir.fun/collections/${contract}/${tokenId}",
      },
    });
  }

  // public static async syncSources() {
  //   _.forEach(sources, (metadata, sourceId) => {
  //     Sources.add(sourceId, metadata);
  //   });
  // }

  public static async add(sourceId: string, metadata: object) {
    const query = `INSERT INTO sources (source_id, metadata)
                   VALUES ( $/sourceId/, $/metadata:json/)
                   ON CONFLICT (source_id) DO UPDATE
                   SET metadata = $/metadata:json/`;

    const values = {
      sourceId,
      metadata: metadata,
    };

    await idb.none(query, values);
  }

  public get(sourceId: string, contract?: string, tokenId?: string) {
    let sourceEntity;

    if (sourceId in this.sources) {
      sourceEntity = (this.sources as any)[sourceId];
    } else {
      sourceEntity = Sources.getDefaultSource(sourceId);
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

  public async set(sourceId: string, metadata: object) {
    const query = `UPDATE sources
                   SET metadata = $/metadata:json/
                   WHERE source_id = $/sourceId/`;

    const values = {
      id: sourceId,
      metadata: metadata,
    };

    await idb.none(query, values);
  }
}
