import { TxData } from "@reservoir0x/sdk/dist/utils";
import { TxAttribute } from "@reservoir0x/sdk/dist/router/v6/types";
import { bn } from "@/common/utils";
import gasDatabase from "./database.json";

export type GasEstimationTranscation = {
  txData: TxData;
  txTags: TxAttribute;
};

function computeGasByTxAttribute(txTags: TxAttribute) {
  let totalGas = bn(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gasData = gasDatabase as any;

  // Approval Gas
  if (txTags.approvals) {
    const approvalGasBase = gasDatabase.approval;
    const approvalGasSpend = bn(txTags.approvals).mul(approvalGasBase);
    totalGas = totalGas.add(approvalGasSpend);
  }

  // Swap Gas
  if (txTags.swaps) {
    const swapGasBase = gasDatabase.swap;
    const swapGasSpend = bn(txTags.swaps).mul(swapGasBase);
    totalGas = totalGas.add(swapGasSpend);
  }

  // Listings
  if (txTags.listings) {
    for (const listing of txTags.listings) {
      const keyId = `listings:${listing.protocol}`;
      const listingGasBase = keyId in gasData ? gasData[keyId] : gasDatabase["listings:*"];
      const listingGasSpend = bn(listing.count).mul(listingGasBase);
      totalGas = totalGas.add(listingGasSpend);
    }
  }

  // Bids
  if (txTags.bids) {
    for (const bid of txTags.bids) {
      const keyId = `bids:${bid.protocol}`;
      const bidGasBase = keyId in gasData ? gasData[keyId] : gasData["bids:*"];
      const bidGasSpend = bn(bid.count).mul(bidGasBase);
      totalGas = totalGas.add(bidGasSpend);
    }
  }

  // Mints
  if (txTags.mints) {
    const mintGasBase = gasDatabase.mint;
    const mintGasSpend = bn(txTags.mints).mul(mintGasBase);
    totalGas = totalGas.add(mintGasSpend);
  }

  return totalGas;
}

export async function getTotalEstimateGas(transcations: GasEstimationTranscation[]) {
  const result = await Promise.all(
    transcations.map(({ txTags }) => {
      return computeGasByTxAttribute(txTags);
    })
  );
  const totalGas = result.reduce((total, item) => {
    return total.add(item);
  }, bn(0));

  return {
    totalEstimateGas: totalGas.toString(),
  };
}
