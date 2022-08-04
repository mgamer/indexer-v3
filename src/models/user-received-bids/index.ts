/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

import { UserReceivedBidsInsertParams } from "@/models/user-received-bids/user-received-bids-entity";

export class UserReceivedBids {
  public static async addBids(bids: UserReceivedBidsInsertParams[]) {
    if (!bids.length) {
      return;
    }

    const columns = new pgp.helpers.ColumnSet(
      ["address", "contract", "token_id", "order_id", "maker", "price", "value", "quantity"],
      { table: "user_activities" }
    );

    const data = bids.map((bid) => ({
      address: bid.address,
      contract: toBuffer(bid.contract),
      token_id: bid.tokenId,
      order_id: bid.orderId,
      maker: toBuffer(bid.maker),
      price: bid.price,
      value: bid.value,
      quantity: bid.quantity,
    }));

    const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING";

    await idb.none(query);
  }
}
