import _ from "lodash";
import { CenterdevMetadataProvider } from "./centerdev-metadata-provicer";
import { OnchainMetadataProvider } from "./onchain-metadata-provicer";
import { RaribleMetadataProvider } from "./rarible-metadata-provider";
import { SimplehashMetadataProvider } from "./simplehash-metadata-provider";
import { SoundxyzMetadataProvider } from "./soundxyz-metadata-provider";

export const MetadataProviders = [
  new RaribleMetadataProvider(),
  new CenterdevMetadataProvider(),
  new OnchainMetadataProvider(),
  new OnchainMetadataProvider(),
  new SimplehashMetadataProvider(),
  new SoundxyzMetadataProvider(),
];

export const MetadataProvidersMap = _.keyBy(MetadataProviders, "method");
