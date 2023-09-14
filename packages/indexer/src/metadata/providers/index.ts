import _ from "lodash";
import { OnchainMetadataProvider } from "./onchain-metadata-provider";
import { RaribleMetadataProvider } from "./rarible-metadata-provider";
import { SimplehashMetadataProvider } from "./simplehash-metadata-provider";
import { SoundxyzMetadataProvider } from "./soundxyz-metadata-provider";

export const MetadataProviders = [
  new RaribleMetadataProvider(),
  new OnchainMetadataProvider(),
  new OnchainMetadataProvider(),
  new SimplehashMetadataProvider(),
  new SoundxyzMetadataProvider(),
];

export const MetadataProvidersMap = _.keyBy(MetadataProviders, "method");
