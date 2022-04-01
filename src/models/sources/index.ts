import _ from "lodash";

import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";

export class Sources {
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

  public async get(sourceId: string) {
    const source: SourcesEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM sources
              WHERE source_id = $/sourceId/`,
      {
        sourceId,
      }
    );

    if (source) {
      return new SourcesEntity(source);
    }

    return null;
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
