import { Interface } from "ethers/lib/utils";
import { EventData } from ".";

export const metadataUpdate: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-single-token",
  topic: "0xf8e1a15aba9398e019f0b49df1a4fde98ee17ae345cb5f6b5e2c27f5033e8ce7",
  numTopics: 1,
  abi: new Interface([`event MetadataUpdate(uint256 _tokenId)`]),
};

export const batchMetadataUpdate: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-batch-tokens",
  topic: "0x6bd5c950a8d8df17f772f5af37cb3655737899cbf903264b9795592da439661c",
  numTopics: 1,
  abi: new Interface([`event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)`]),
};

export const metadataUpdateURI: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-uri",
  topic: "0x0e0d473f43a9d8727e62653cce4cd80d0c870ffb83dc4c93c9db4cb8ffe7053e",
  numTopics: 1,
  abi: new Interface([`event URI(string _value, uint256 indexed _id)`]),
};
