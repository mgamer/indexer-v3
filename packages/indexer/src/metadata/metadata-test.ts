/* eslint-disable no-console */
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

// Use this to run custom/extend metadata in local env
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

const CUSTOM_CONTRACT_TO_TEST = "0xc143bbfcdbdbed6d454803804752a064a622c1f3";
const CUSTOM_TOKEN_ID_TO_TEST = ["1"];

const EXTEND_CONTRACT_TO_TEST = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
const EXTEND_TOKEN_ID_TO_TEST = ["15"];

const testControl = async () => {
  // This is a control test, to make sure that env is set up correctly

  // get token metadata
  const controlToken = [
    {
      contract: "0xed5af388653567af2f388e6224dc7c4b3241c544",
      tokenId: "15",
    },
  ];
  const controlTokenResponse = await MetadataProviderRouter.getTokensMetadata(controlToken).catch(
    (error) => {
      console.error(error);
      process.exit(1);
    }
  );

  if (controlTokenResponse.length !== 1) {
    console.error("Control test failed: token metadata not found");
    process.exit(1);
  }
  console.log("Control Test result: ", controlTokenResponse);

  // get collection metadata
  const controlCollectionResponse = await MetadataProviderRouter.getCollectionMetadata(
    "0xed5af388653567af2f388e6224dc7c4b3241c544",
    "15"
  ).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (!controlCollectionResponse) {
    console.error("Control test failed: collection metadata not found");
    process.exit(1);
  }

  console.log("Control Test result: ", controlCollectionResponse);
};

const testCustom = async () => {
  // Test Custom

  const customCollectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
    CUSTOM_CONTRACT_TO_TEST,
    CUSTOM_TOKEN_ID_TO_TEST[0]
  ).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (!customCollectionMetadata) {
    console.error("Custom test failed: custom collection metadata not found");
    process.exit(1);
  }

  console.log("Custom Test result: ", customCollectionMetadata);

  // Test extend

  const extendTokensMetadata = await MetadataProviderRouter.getTokensMetadata(
    EXTEND_TOKEN_ID_TO_TEST.map((tokenId) => ({
      contract: EXTEND_CONTRACT_TO_TEST,
      tokenId,
    }))
  ).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (!extendTokensMetadata) {
    console.error("Extend test failed: collection metadata not found");
    process.exit(1);
  }

  console.log("Extend Test result: ", extendTokensMetadata);
};

testControl()
  .then(() => {
    console.log("Control test passed");
    testCustom().then(() => {
      console.log("Custom test passed");
      process.exit(0);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
