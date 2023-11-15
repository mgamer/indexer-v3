import { Wallet } from "@ethersproject/wallet";
import { config } from "@/config/index";

export function getCoSigner() {
  return new Wallet(config.cosignerKey);
}
