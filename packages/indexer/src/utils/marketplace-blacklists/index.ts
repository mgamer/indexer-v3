import * as Sdk from "@reservoir0x/sdk";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import { idb, redb } from "@/common/db";
import { OrderKind } from "@/orderbook/orders";

export type Opreator = {
  address: string;
  marketplace: OrderKind;
};

const allOperatorList: Opreator[] = [
  {
    address: Sdk.Blur.Addresses.ExecutionDelegate[config.chainId],
    marketplace: "blur",
  },
  {
    address: Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId],
    marketplace: "looks-rare",
  },
  {
    address: Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId],
    marketplace: "looks-rare",
  },
  {
    address: Sdk.Nftx.Addresses.MarketplaceZap[config.chainId],
    marketplace: "nftx",
  },
  {
    address: Sdk.Seaport.Addresses.OpenseaConduit[config.chainId],
    marketplace: "seaport",
  },
  {
    address: Sdk.SeaportV14.Addresses.OpenseaConduit[config.chainId],
    marketplace: "seaport-v1.4",
  },
  {
    address: Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId],
    marketplace: "x2y2",
  },
  {
    address: Sdk.Element.Addresses.Exchange[config.chainId],
    marketplace: "element-erc721",
  },
  {
    address: Sdk.Element.Addresses.Exchange[config.chainId],
    marketplace: "element-erc1155",
  },
  {
    address: Sdk.Sudoswap.Addresses.LSSVMRouter[config.chainId],
    marketplace: "sudoswap",
  },
];

export async function checkMarketplaceIsFiltered(collection: string, marketplace: OrderKind) {
  const operatorList = allOperatorList.filter((c) => c.marketplace === marketplace);
  const blacklist = await getMarketplaceBlacklist(collection);
  const isBlocked = operatorList.some((c) => blacklist.includes(c.address));
  return isBlocked;
}

export const getMarketplaceBlacklist = async (collection: string) => {
  const contract = new Contract(
    Sdk.Seaport.Addresses.OperatorFilterRegistry[config.chainId],
    new Interface([
      "function filteredOperators(address registrant) external view returns (address[] memory)",
    ]),
    baseProvider
  );
  const opreators = await contract.filteredOperators(collection);
  return opreators.map((_: string) => _.toLowerCase());
};

export async function updateMarketplaceBlacklist(collection: string) {
  const blacklists = await getMarketplaceBlacklist(collection);
  await idb.none(
    `
      UPDATE collections
        SET marketplace_blacklists = $/blacklists:json/
      WHERE collections.id = $/collection/
    `,
    {
      collection,
      blacklists: blacklists,
    }
  );
}

export async function getMarketplaceBlacklistFromDB(collection: string) {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
      COALESCE(collections.marketplace_blacklists, '{}') AS marketplace_blacklists
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );
  return collectionResult;
}
