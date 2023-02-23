/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";

export class DeploymentHelper {
  public deployer: SignerWithAddress;

  private constructor(deployer: SignerWithAddress) {
    this.deployer = deployer;
  }

  public static async getInstance(): Promise<DeploymentHelper> {
    const [deployer] = await ethers.getSigners();
    return new DeploymentHelper(deployer);
  }

  public async deploy(
    contractName: string,
    args: any[] = [],
    options?: {
      verifyOnEtherscan: boolean;
    }
  ) {
    // const contract = await ethers
    //   .getContractFactory(contractName, this.deployer)
    //   .then((factory) => factory.deploy(...args));
    // console.log(`"${contractName}" was deployed at address ${contract.address}`);

    if (options?.verifyOnEtherscan) {
      // Wait for the deployment tx to get propagated
      await new Promise((resolve) => setTimeout(resolve, 90 * 1000));

      await hre.run("verify:verify", {
        address: "0x955A3019B4662Dcb68d6CC71F198fAF1F64C1bf9",
        constructorArguments: args,
      });
      console.log(`"${contractName}" successfully verified on Etherscan`);
    }

    // return contract;
  }
}

const main = async () => {
  const deploymentHelper = await DeploymentHelper.getInstance();

  await deploymentHelper.deploy(
    "SeaportV14Module",
    [deploymentHelper.deployer.address, "0xc0f489a34672d5b960a19279d99d77e94221d0c9"],
    { verifyOnEtherscan: true }
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
