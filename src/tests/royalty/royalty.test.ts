// import { config as dotEnvConfig } from "dotenv";
// dotEnvConfig();
// import { baseProvider } from "@/common/provider";
// import { parseCallTrace, searchForCall } from "@georgeroman/evm-tx-simulator";

// import { logger } from "@/common/logger";
// import { bn } from "@/common/utils";
// import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
// import * as es from "@/events-sync/storage";
// import * as utils from "@/events-sync/utils";

// describe("Royalty", () => {
//   test("seaport", async () => {
//     const openSeaFeeRecipients = [
//       "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
//       "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
//       "0x0000a26b00c1f0df003000390027140000faa719",
//     ];

//     // const txTrace = await utils.fetchTransactionTrace(txHash);
//     // const royaltyRecipients: string[] = [];
//     // const collectionRoyalties = await redb.oneOrNone(
//     //   `SELECT royalties FROM collections WHERE id = $/id/`,
//     //   { id: info.contract }
//     // );

//     // if (collectionRoyalties) {
//     //   for (const royalty of collectionRoyalties.royalties) {
//     //     royaltyRecipients.push(royalty.recipient);
//     //   }
//     // }

//     // // refreshRegistryRoyalties

//     // feeBreakdown = info.fees.map(({ recipient, amount }) => ({
//     //   kind: royaltyRecipients.includes(recipient.toLowerCase()) ? "royalty" : "marketplace",
//     //   recipient,
//     //   bps: price.eq(0) ? 0 : bn(amount).mul(10000).div(price).toNumber(),
//     // }));
//   });
// });
