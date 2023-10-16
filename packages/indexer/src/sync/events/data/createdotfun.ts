import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";

export const metadataRendererUpdated: EventData = {
  kind: "createdotfun",
  subKind: "createdotfun-metadata-renderer-updated",
  topic: "0x60a886c8dc324af9c6d6a1bf7369ffe7557ef345eb5717bceffb59beac879a0a",
  numTopics: 1,
  abi: new Interface([
    `event MetadataRendererUpdated(
      address renderer
    )`,
  ]),
};

export const moduleAdded: EventData = {
  kind: "createdotfun",
  subKind: "createdotfun-module-added",
  topic: "0xead6a006345da1073a106d5f32372d2d2204f46cb0b4bca8f5ebafcbbed12b8a",
  numTopics: 1,
  abi: new Interface([`event ModuleAdded(address module)`]),
};
