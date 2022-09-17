import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";

const args = process.argv.splice(2);

(async () => {
  const tx = await baseProvider.getTransactionReceipt(args[0]);
  console.log(JSON.stringify(tx, null, 2));
})();
