import { Interface, Result } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";

export type CreatorConfig = {
  transferSecurityLevel: number;
  operatorWhitelistId: string;
  permittedContractReceiversId: string;
  operators: string[];
  receivers: string[];
  validator: string;
};

export const getCreatorTokenConfig = async (collection: string) => {
  const iface = new Interface([
    "function getSecurityPolicy() public view returns (uint8 transferSecurityLevel, uint120 operatorWhitelistId, uint120 permittedContractReceiversId)",
    "function getWhitelistedOperators() public view returns (address[])",
    "function getPermittedContractReceivers() public view returns (address[])",
    "function getTransferValidator() public view returns (address)",
  ]);

  const token = new Contract(collection, iface, baseProvider);

  const [securityPolicy, operators, receivers, validator] = await Promise.all([
    token.getSecurityPolicy(),
    token.getWhitelistedOperators(),
    token.getPermittedContractReceivers(),
    token.getTransferValidator(),
  ]);

  const { transferSecurityLevel, operatorWhitelistId, permittedContractReceiversId } =
    securityPolicy;

  const tokenConfig: CreatorConfig = {
    transferSecurityLevel,
    operatorWhitelistId: operatorWhitelistId.toString(),
    permittedContractReceiversId: permittedContractReceiversId.toString(),
    operators: operators.map((c: Result) => c.toLowerCase()),
    receivers: receivers.map((c: Result) => c.toLowerCase()),
    validator: validator.toLowerCase(),
  };

  return tokenConfig;
};

export const getCreatorConfigFromDB = async (contract: string): Promise<CreatorConfig> => {
  const result = await redb.oneOrNone(
    `
      SELECT *
      FROM creator_token_configs
      WHERE creator_token_configs.collection = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  return {
    transferSecurityLevel: result.transfer_security_level,
    operatorWhitelistId: result.operator_whitelist_id.toString(),
    permittedContractReceiversId: result.permitted_contract_receivers_id.toString(),
    operators: result.whitelisted_operators,
    receivers: result.permitted_contract_receivers,
    validator: fromBuffer(result.transfer_validator),
  };
};

export const updateCreatorTokenConfig = async (collection: string) => {
  const config = await getCreatorTokenConfig(collection);
  await idb.none(
    `
      INSERT INTO creator_token_configs (
        collection,
        transfer_validator,
        transfer_security_level,
        operator_whitelist_id,
        permitted_contract_receivers_id,
        whitelisted_operators,
        permitted_contract_receivers
      ) VALUES (
        $/collection/,
        $/validator/,
        $/transferSecurityLevel/,
        $/operatorWhitelistId/,
        $/permittedContractReceiversId/,
        $/operators:json/,
        $/receivers:json/
      )
      ON CONFLICT (collection)
      DO UPDATE SET
        transfer_validator = $/validator/,
        transfer_security_level = $/transferSecurityLevel/,
        operator_whitelist_id = $/operatorWhitelistId/,
        permitted_contract_receivers_id = $/permittedContractReceiversId/,
        whitelisted_operators = $/operators:json/,
        permitted_contract_receivers = $/receivers:json/,
        updated_at = now()
    `,
    {
      collection: toBuffer(collection),
      validator: toBuffer(config.validator),
      transferSecurityLevel: config.transferSecurityLevel,
      operatorWhitelistId: config.operatorWhitelistId,
      permittedContractReceiversId: config.permittedContractReceiversId,
      operators: config.operators,
      receivers: config.receivers,
    }
  );

  return config;
};

export const refreshConfig = async (
  validator: string,
  listId: string,
  triggerType: "receiver" | "operator"
) => {
  const query =
    `
  SELECT collection
  FROM creator_token_configs
  WHERE creator_token_configs.` +
    (triggerType === "receiver" ? `permitted_contract_receivers_id` : `operator_whitelist_id`) +
    `  = $/id/
  AND transfer_validator = $/validator/
`;

  const result = await redb.oneOrNone(query, { id: listId, validator: toBuffer(validator) });
  if (!result) {
    // Not exist
    return;
  }

  const collection = fromBuffer(result.collection);
  await updateCreatorTokenConfig(collection);
};

export const saveTransferValidatorEOA = async (validator: string, account: string) => {
  await idb.none(
    `
        INSERT INTO transfer_validator_eoas (
            validator,
            address
        ) VALUES (
            $/validator/,
            $/address/
        )
        ON CONFLICT DO NOTHING
      `,
    {
      validator: toBuffer(validator),
      address: toBuffer(account),
    }
  );
};

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const config = await getCreatorConfigFromDB(contract);
  if (!config) {
    return false;
  }

  const policies = [
    1, // CallerConstraints.OperatorWhitelistEnableOTC, ReceiverConstraints.None
    2, // CallerConstraints.OperatorWhitelistDisableOTC, ReceiverConstraints.None
    3, // CallerConstraints.OperatorWhitelistEnableOTC, ReceiverConstraints.NoCode
    4, // CallerConstraints.OperatorWhitelistEnableOTC, ReceiverConstraints.EOA
    5, // CallerConstraints.OperatorWhitelistDisableOTC, ReceiverConstraints.NoCode
    6, // CallerConstraints.OperatorWhitelistDisableOTC, ReceiverConstraints.EOA
  ];

  if (!policies.includes(config.transferSecurityLevel)) {
    return false;
  }

  if (config.operators.length === 0) {
    return false;
  }

  return !operators.every((c) => config.operators.includes(c));
};
