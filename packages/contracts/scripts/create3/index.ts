/* eslint-disable no-console */

import { ethers } from "hardhat";

import { triggerByModule } from "./deploy";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

  chainId;
  triggerByModule;

  await triggerByModule.ReservoirV6_0_1();
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
