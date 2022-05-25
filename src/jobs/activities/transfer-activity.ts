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

export class TransferActivity {
  public static async handleEvent(data: NftTransferEventData) {
    const activitiesParams: ActivitiesEntityInsertParams[] = [];
    const token = await Tokens.getByContractAndTokenId(data.contract, data.tokenId);

    // If no token found
    if (_.isNull(token)) {
      logger.error("transfer-activity", `No token found for ${JSON.stringify(data)}`);
      return;
    }

    const activityHash = Activities.getActivityHash(
      data.transactionHash,
      data.logIndex.toString(),
      data.batchIndex.toString()
    );

    const baseActivity = {
      subject: ActivitySubject.collection,
      type: data.fromAddress == AddressZero ? ActivityType.mint : ActivityType.transfer,
      activityHash,
      contract: data.contract,
      collectionId: token.collectionId,
      tokenId: data.tokenId,
      address: data.fromAddress,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      price: 0,
      amount: data.amount,
      metadata: {
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        batchIndex: data.batchIndex,
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

    if (data.fromAddress != AddressZero) {
      // One record for the user to address
      baseActivity.address = data.toAddress;
      activitiesParams.push(_.clone(baseActivity));
    }

    await Activities.add(activitiesParams);
  }
}

export type NftTransferEventData = {
  contract: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  transactionHash: string;
  logIndex: number;
  batchIndex: number;
};
