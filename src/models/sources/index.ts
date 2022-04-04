import _ from "lodash";

import { config } from "@/config/index";
import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";

export class Sources {
  public static getDefaultSource(sourceId: string): SourcesEntity {
    return new SourcesEntity({
      source_id: sourceId,
      metadata: {
        id: sourceId,
        name: "Unknown",
        icon: null,
        urlMainnet: null,
        urlRinkeby: null,
      },
    });
  }

  public async getAll() {
    const sources: SourcesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM sources`
    );

    if (sources) {
      return _.map(sources, (source) => new SourcesEntity(source));
    }

    return null;
  }

  public async get(sourceId: string, contract?: string, tokenId?: string) {
    const source: SourcesEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM sources
              WHERE source_id = $/sourceId/`,
      {
        sourceId,
      }
    );

    if (source) {
      const sourceEntity = new SourcesEntity(source);

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

    return Sources.getDefaultSource(sourceId);
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
