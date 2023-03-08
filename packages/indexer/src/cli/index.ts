import { program } from "commander";

import { getEnhancedEventsFromTx } from "@/events-sync/handlers";
import { extractOnChainData } from "@/events-sync/handlers/royalties";

export async function parseTranscation(txHash: string) {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);
  return {
    events,
    allOnChainData,
  };
}

program
  .command("tx")
  .argument("<tx>")
  .description("Parse events from transcation")
  .action(async (txHash) => {
    const events = await parseTranscation(txHash);
    if (process) {
      process.stdout.write(JSON.stringify(events, null, 2));
    }
  });

program.parse();
