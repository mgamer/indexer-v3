/* eslint-disable no-console */

import * as Sdk from "@reservoir0x/sdk/src";
import { ethers } from "hardhat";

import { DEPLOYER, triggerByModule } from "./deploy";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error("Wrong deployer");
  }

  if (Sdk.Common.Addresses.Create3Factory[chainId]) {
    process.env.CREATE3_FACTORY_ADDRESS_OVERRIDE = Sdk.Common.Addresses.Create3Factory[chainId];
  }

  // First deploy the router
  const router = await triggerByModule.ReservoirV6_0_1();
  if (router) {
    Sdk.RouterV6.Addresses.Router[chainId] = router;
  }

  // Then any modules that depend on the router
  for (const deploy of Object.values(triggerByModule)) {
    await deploy(chainId);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
