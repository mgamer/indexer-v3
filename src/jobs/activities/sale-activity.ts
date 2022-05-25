import {
  ActivitiesEntityInsertParams,
  ActivitySubject,
  ActivityType,
} from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";
import { AddressZero } from "@ethersproject/constants";

export class SaleActivity {
  public static async handleEvent(info: FillEventData) {
    const activitiesParams: ActivitiesEntityInsertParams[] = [];
    const token = await Tokens.getByContractAndTokenId(info.contract, info.tokenId);

    // If no token found
    if (_.isNull(token)) {
      logger.error("sale-activity", `No token found for ${JSON.stringify(info)}`);
      return;
    }

    const activityHash = Activities.getActivityHash(
      info.transactionHash,
      info.logIndex.toString(),
      info.batchIndex.toString()
    );

    const baseActivity = {
      subject: ActivitySubject.collection,
      type: info.fromAddress == AddressZero ? ActivityType.mint : ActivityType.transfer,
      activityHash,
      contract: info.contract,
      collectionId: token.collectionId,
      tokenId: info.tokenId,
      address: info.fromAddress,
      fromAddress: info.fromAddress,
      toAddress: info.toAddress,
      price: info.price,
      amount: info.amount,
      metadata: {
        transactionHash: info.transactionHash,
        logIndex: info.logIndex,
        batchIndex: info.batchIndex,
      },
    };

    // Create a collection activity
    activitiesParams.push(_.clone(baseActivity));

    // Create a token activity
    baseActivity.subject = ActivitySubject.token;
    activitiesParams.push(_.clone(baseActivity));

    // One record for the user from address
    baseActivity.subject = ActivitySubject.user;
    activitiesParams.push(_.clone(baseActivity));

    // One record for the user to address
    baseActivity.address = info.toAddress;
    activitiesParams.push(_.clone(baseActivity));

    await Activities.add(activitiesParams);
  }
}

export type FillEventData = {
  contract: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;
  transactionHash: string;
  logIndex: number;
  batchIndex: number;
};
