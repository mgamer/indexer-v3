/* eslint-disable no-console */

// Use this to run custom/extend metadata in local env
import MetadataApi from "@/metadata/metadata-api";

const CUSTOM_CONTRACT_TO_TEST = "0xed5af388653567af2f388e6224dc7c4b3241c544";
const CUSTOM_TOKEN_ID_TO_TEST = ["15"];

const EXTEND_CONTRACT_TO_TEST = "0xed5af388653567af2f388e6224dc7c4b3241c544";
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
  const controlTokenResponse = await MetadataApi.getTokensMetadata(controlToken).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (controlTokenResponse.length !== 1) {
    console.error("Control test failed: token metadata not found");
    process.exit(1);
  }
  console.log("Control Test result: ", controlTokenResponse);

  // get collection metadata
  const controlCollectionResponse = await MetadataApi.getCollectionMetadata(
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

  const collectionMetadata = await MetadataApi.getCollectionMetadata(
    CUSTOM_CONTRACT_TO_TEST,
    CUSTOM_TOKEN_ID_TO_TEST[0]
  ).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (!collectionMetadata) {
    console.error("Custom test failed: collection metadata not found");
    process.exit(1);
  }

  console.log("Custom Test result: ", collectionMetadata);

  // Test extend

  const extendCollectionMetadata = await MetadataApi.getCollectionMetadata(
    EXTEND_CONTRACT_TO_TEST,
    EXTEND_TOKEN_ID_TO_TEST[0]
  ).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  if (!extendCollectionMetadata) {
    console.error("Extend test failed: collection metadata not found");
    process.exit(1);
  }

  console.log("Extend Test result: ", extendCollectionMetadata);
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
