import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getSDNList } from "../../utils/ofac";
import { jest, describe, it } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Ofac SDN", () => {
  it("getList", async () => {
    await getSDNList();
    // expect(onchainConfig.validator).toBe(dbConfig.validator);
    // expect(onchainConfig.transferSecurityLevel).toBe(dbConfig.transferSecurityLevel);
    // expect(onchainConfig.permittedContractReceiversId).toBe(dbConfig.permittedContractReceiversId);
    // expect(onchainConfig.operatorWhitelistId).toBe(dbConfig.operatorWhitelistId);
    // expect(onchainConfig.receivers.length).toBe(dbConfig.receivers.length);
    // expect(onchainConfig.operators.length).toBe(dbConfig.operators.length);
  });
});
