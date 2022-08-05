/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { idb } from "@/common/db";

export class UserReceivedBids {
  public static async cleanBids(limit: number) {
    const query = `
      DELETE FROM user_received_bids
      WHERE id IN (
        SELECT id
        FROM user_received_bids
        WHERE clean_at < NOW()
        LIMIT ${limit}
      )
      
      RETURNING 1
    `;

    const result = await idb.manyOrNone(query);
    return _.size(result);
  }
}
