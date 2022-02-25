import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { v4 as uuidv4 } from 'uuid';
import { db, pgp } from "@/common/db";

export class DailyVolume {

  /**
   * Check if the daily volume for this day was already calculated and stored
   * We will keep a collection_id: -1 and timestamp in the database for each day we processed already
   *
   * @param startTime
   */
  public static async isDaySynced(startTime: number): Promise<boolean> {
    try {
      const initialRow = await db.oneOrNone(`
            SELECT volume
            FROM "daily_volumes"
            WHERE "collection_id" = '-1'
              AND "timestamp" = $/startTime/
        `, {
        startTime
      });

      if (initialRow !== null) {
        logger.info('daily-volumes', `Daily volumes for ${startTime} already calculated, nothing to do`);
        return true;
      }
    } catch (e) {
      logger.error("daily-volumes", JSON.stringify({
        msg: `Couldn't determine if the daily volume for timestamp ${startTime} was already added to the database`,
        timestamp: startTime,
        exception: e
      }));

      throw e;
    }

    return false;
  }

  /**
   * Calculate for the given day the sales volume and store these values in the database:
   * - daily_volumes: so we can get historical data for each day
   * - collections: update each collection with the rank and sales volume, for fast retrieval in APIs
   *
   * Once these updates are done, add a collection_id: -1, timestamp to daily_volumes to indicate we calculated this
   * day already
   *
   * @param startTime
   * @param updateCollections
   */
  public static async calculateDay(startTime: number, updateCollections: boolean = false): Promise<boolean> {

    try {
      if (await this.isDaySynced(startTime)) {
        return true;
      }
    } catch (e) {
      return false;
    }

    // Get the startTime and endTime of the day we want to calculate
    const endTime = startTime + 24 * 3600;

    let results = [];
    try {
      results = await db.manyOrNone(`
          SELECT
              "collection_id",
              sum("fe"."price") AS "volume",              
              RANK() OVER (ORDER BY SUM(price) DESC, "collection_id") "rank"
          FROM "fill_events_2" "fe"
              JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
              JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
          WHERE
              "fe"."timestamp" >= $/startTime/
              AND "fe"."timestamp" < $/endTime/
          GROUP BY "collection_id"
        `, {
        startTime, endTime
      });
    } catch (e) {
      logger.error('daily-volumes', JSON.stringify({
        msg: `Error while trying to fetch the calculations for the daily volume`,
        timestamp: startTime,
        exception: e
      }));

      return false;
    }

    // If we have results, we can now insert them into the daily_volumes table and update collections
    if (results.length) {
      results.push({
        collection_id: -1,
        volume: 0,
        rank: -1
      });

      const queries: any = [];
      results.forEach((values) => {
        queries.push({
          query: `
            INSERT INTO 
                daily_volumes
                (
                 collection_id, 
                 timestamp, 
                 rank, 
                 volume
                )
            VALUES (
                $/collection_id/, 
                ${startTime}, 
                $/rank/, 
                $/volume/
            )
            ON CONFLICT ON CONSTRAINT daily_volumes_pk
            DO 
                UPDATE SET volume = $/volume/, rank = $/rank/
            `,
          values: values
        });

        if (updateCollections) {
          // Skip the query when the collection_id = -1
          if (values.collection_id !== -1) {
            queries.push({
              query: `
                  UPDATE collections
                  SET day1_volume = $ / volume /,
                      day1_rank   = $ / rank /
                  WHERE id = $ / collection_id /
              `,
              values: values
            });
          }
        }
      })

      try {
        const concat = pgp.helpers.concat(queries);
        const result = await db.none(concat);
      } catch (e) {
        logger.error('daily-volumes', JSON.stringify({
          msg: `Error while inserting/updating daily volumes`,
          timestamp: startTime,
          exception: e
        }));
        return false;
      }
    }

    return true;
  }

  /**
   * Work our way back until the earliest point in time for fill_events_2
   * We take the minimum timestamp we have from that table, and then sync backwards
   *
   * @param startTime
   */
  public static async updatePreviousDays(startTime: number) {
    try {
      const result = await redis.get('daily-volumes-sync-completed');
      if (result) {
        return true;
      }
    } catch (e) {
      logger.error('daily-volumes', JSON.stringify({
        msg: `Unable to get daily-volumes-sync-completed from redis`,
        timestamp: startTime,
        exception: e
      }));

      return false;
    }

    const minimum = await db.oneOrNone(`SELECT MIN(timestamp) FROM fill_events_2`)
    console.log(minimum);

    // await redis.set('daily-volumes-sync-completed', new Date().getTime());
  }
}
