import { Interface } from "@ethersproject/abi";
import { ArtBlocks } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

// Project is created on CollectionContract
// event is ProjectUpdated(projectId, FIELD_PROJECT_CREATED);

// Project is activated / deactivate on the CollecitonContract
// event is ProjectUpdated(projectId, FIELD_PROJECT_ACTIVE);

// Project minting is paused / unpaused on the CollectionContract
// event is ProjectUpdated(projectId, FIELD_PROJECT_PAUSED);

// Project Minter is set on MinterFilter
// event is ProjectMinterRegistered(projectId, _minterAddress, IFilteredMinterV0(_minterAddress).minterType());

// Project Minter is removed on MinterFilter
// event is ProjectMinterRemoved(projectId);

// Project price is configured on MinterTypedContract

// MinterSetPriceV4 0x234b25288011081817b5cc199c3754269ccb76d2
// When price is changed, event is  PricePerTokenInWeiUpdated(projectId, _pricePerTokenInWei);

// MinterDAExpSettlementV1 0xfdE58c821D1c226b4a45c22904de20b114EDe7E7
// emit SetAuctionDetails( projectId, _auctionTimestampStart, _priceDecayHalfLifeSeconds, _startPrice, _basePrice );

// MinterMerkleV5 0xB8Bd1D2836C466DB149f665F777928bEE267304d
// allowlist
// emit PricePerTokenInWeiUpdated(projectId, _pricePerTokenInWei);
// @TODO: ask artblocks where to get the merkletree?

let abi: Interface;

abi = new Interface([`event ProjectUpdated(uint256 indexed projectId, bytes32 indexed update)`]);
export const projectUpdated: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-updated",
  addresses: { [ArtBlocks.Addresses.Collection[config.chainId]?.toLowerCase()]: true },
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectUpdated")),
};

abi = new Interface([
  `event ProjectMinterRegistered(uint256 indexed projectId, address indexed minterAddress, string minterType)`,
]);
export const projectMinterRegistered: EventData = {
  kind: "artblocks",
  subKind: "artblocks-minter-registered",
  addresses: { [ArtBlocks.Addresses.MinterFilter[config.chainId]?.toLowerCase()]: true },
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectMinterRegistered")),
};

abi = new Interface([`event ProjectMinterRemoved(uint256 indexed projectId)`]);
export const projectMinterRemoved: EventData = {
  kind: "artblocks",
  subKind: "artblocks-minter-removed",
  addresses: { [ArtBlocks.Addresses.MinterFilter[config.chainId]?.toLowerCase()]: true },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectMinterRemoved")),
};

abi = new Interface([
  `event PricePerTokenInWeiUpdated(uint256 indexed projectId,uint256 indexed pricePerTokenInWei)`,
]);
export const projectPriceUpdate: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-price-update",
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("PricePerTokenInWeiUpdated")),
};

abi = new Interface([
  `event ProjectCurrencyInfoUpdated(uint256 indexed projectId,address indexed currencyAddress,string currencySymbol)`,
]);
export const projectCurrentcyUpdate: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-currency-update",
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectCurrencyInfoUpdated")),
};

abi = new Interface([
  `event SetAuctionDetails(uint256 indexed projectId,uint256 _auctionTimestampStart,uint256 _priceDecayHalfLifeSeconds,uint256 _startPrice,uint256 _basePrice)`,
]);
export const projectSetAuctionDetails: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-set-auction-details",
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("SetAuctionDetails")),
};
