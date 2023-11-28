import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";

export type ERC721CV2Config = {
  transferValidator: string;
  transferSecurityLevel: number;
  listId: string;
  blacklist: List;
  whitelist: List;
};

export enum TransferSecurityLevels {
  Recommended,
  Zero,
  One,
  Two,
  Three,
  Four,
  Five,
  Six,
  Seven,
}

export type List = {
  accounts: string[];
  codeHashes: string[];
};

export const getERC721CConfig = async (contract: string): Promise<ERC721CV2Config | undefined> => {
  try {
    const token = new Contract(
      contract,
      new Interface([
        "function getTransferValidatorV2() public view returns (address)",
        `function getSecurityPolicyV2() public view returns (
          uint8 transferSecurityLevel,
          uint120 listId
        )`,
      ]),
      baseProvider
    );

    const [transferValidator, securityPolicy] = await Promise.all([
      token.getTransferValidatorV2(),
      token.getSecurityPolicyV2(),
    ]);

    const listId = securityPolicy.listId.toString();

    return {
      transferValidator: transferValidator.toLowerCase(),
      transferSecurityLevel: securityPolicy.transferSecurityLevel,
      listId,
      whitelist: await refreshERC721CV2Whitelist(transferValidator, listId),
      blacklist: await refreshERC721CV2Blacklist(transferValidator, listId),
    };
  } catch {
    // Skip errors
  }

  return undefined;
};

export const getERC721CConfigFromDB = async (
  contract: string
): Promise<ERC721CV2Config | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        erc721c_v2_configs.*,
        erc721c_v2_whitelists.whitelist,
        erc721c_v2_blacklist.blacklist
      FROM erc721c_v2_configs
      LEFT JOIN erc721c_v2_whitelists
        ON erc721c_v2_configs.transfer_validator = erc721c_v2_whitelists.transfer_validator
        AND erc721c_v2_configs.list_id = erc721c_v2_whitelists.id
      LEFT JOIN erc721c_v2_blacklist
        ON erc721c_v2_configs.transfer_validator = erc721c_v2_blacklist.transfer_validator
        AND erc721c_v2_configs.list_id = erc721c_v2_blacklist.id
      WHERE erc721c_v2_configs.contract = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  if (!result) {
    return undefined;
  }

  return {
    transferValidator: fromBuffer(result.transfer_validator),
    transferSecurityLevel: result.transfer_security_level,
    listId: result.list_id,
    whitelist: result.whitelist ?? [],
    blacklist: result.blacklist ?? [],
  };
};

export const refreshERC721CV2Config = async (contract: string) => {
  const config = await getERC721CConfig(contract);
  if (config) {
    await idb.none(
      `
        INSERT INTO erc721c_v2_configs (
          contract,
          transfer_validator,
          transfer_security_level,
          list_id
        ) VALUES (
          $/contract/,
          $/transferValidator/,
          $/transferSecurityLevel/,
          $/listId/
        )
        ON CONFLICT (contract)
        DO UPDATE SET
          transfer_validator = $/transferValidator/,
          transfer_security_level = $/transferSecurityLevel/,
          list_id = $/listId/,
          updated_at = now()
      `,
      {
        contract: toBuffer(contract),
        transferValidator: toBuffer(config.transferValidator),
        transferSecurityLevel: config.transferSecurityLevel,
        listId: config.listId,
      }
    );

    return config;
  }

  return undefined;
};

export const refreshERC721CV2Whitelist = async (transferValidator: string, id: string) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getWhitelistedAccounts(uint120 id) public view returns (address[])",
      "function getWhitelistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getWhitelistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getWhitelistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const whitelist = {
    accounts,
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_whitelists (
        transfer_validator,
        id,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        whitelist = $/whitelist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      whitelist,
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
    }
  );

  // Invalid any orders relying on the blacklisted operator
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        contract: fromBuffer(c.contract),
        whitelistedOperators: whitelist.accounts,
        status: "inactive",
      },
    }))
  );

  return whitelist;
};

export const refreshERC721CV2Blacklist = async (transferValidator: string, id: string) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getBlacklistedAccounts(uint120 id) public view returns (address[])",
      "function getBlacklistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getBlacklistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getBlacklistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const blacklist = {
    accounts,
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_blacklist(
        transfer_validator,
        id,
        blacklist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/blacklist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
      blacklist = $/blacklist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      blacklist,
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
    }
  );

  // Invalid any orders relying on the blacklisted operator
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        contract: fromBuffer(c.contract),
        blacklistedOperators: blacklist.accounts,
        status: "inactive",
      },
    }))
  );

  return blacklist;
};

function getListByConfig(config: ERC721CV2Config): {
  whitelist: string[];
  blacklist: string[];
} {
  if (
    config.transferSecurityLevel === TransferSecurityLevels.One ||
    config.transferSecurityLevel === TransferSecurityLevels.Two
  ) {
    return {
      blacklist: config.blacklist.accounts,
      whitelist: [],
    };
  }

  if (config.transferSecurityLevel === TransferSecurityLevels.Recommended) {
    return {
      whitelist: config.whitelist.accounts,
      blacklist: [],
    };
  }

  return {
    whitelist: [],
    blacklist: [],
  };
}

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const config = await getERC721CConfigFromDB(contract);
  if (!config) {
    return false;
  }

  const { whitelist, blacklist } = getListByConfig(config);

  let notInWhitelist = false;
  let isFiltered = false;

  if (whitelist) {
    notInWhitelist = operators.every((op) => !whitelist.includes(op));
  }

  if (blacklist.length) {
    isFiltered = operators.some((op) => blacklist.includes(op));
  }

  return isFiltered || notInWhitelist;
};
