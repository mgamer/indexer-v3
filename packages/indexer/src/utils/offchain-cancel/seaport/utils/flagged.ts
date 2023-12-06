/* eslint-disable @typescript-eslint/no-explicit-any */

import { ReceivedItem } from "@reservoir0x/sdk/dist/seaport-base/types";
import { idb } from "@/common/db";
import _ from "lodash";
import { fromBuffer } from "@/common/utils";

async function fetchFlagged(considerations: ReceivedItem[]) {
  const query: any = {};
  for (const consideration of considerations) {
    const [contract, tokenId] = [consideration.token, consideration.identifier];
    const tokensFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;
    if (_.isUndefined((query as any).tokensFilter)) {
      (query as any).tokensFilter = [];
    }

    (query as any).tokensFilter.push(tokensFilter);
  }
  (query as any).tokensFilter = _.join((query as any).tokensFilter, ",");
  const result = await idb.manyOrNone(
    `
      SELECT
        tokens.contract,
        tokens.token_id,
        tokens.is_flagged
      FROM tokens
      WHERE (tokens.contract, tokens.token_id) IN ($/tokensFilter:raw/)
    `,
    query
  );
  return new Set(
    result.filter((c) => c.is_flagged).map((c) => `${fromBuffer(c.contract)}:${c.token_id}`)
  );
}

export class FlaggingChecker {
  private considerations: ReceivedItem[][];
  private flaggedTokensIds?: Set<string>;
  constructor(considerations: ReceivedItem[][]) {
    this.considerations = considerations;
  }

  async containsFlagged(consideration: ReceivedItem[]): Promise<boolean> {
    if (!this.flaggedTokensIds) {
      this.flaggedTokensIds = await this.getFlagged();
    }
    for (let i = 0; i < consideration.length; i++) {
      if (this.flaggedTokensIds.has(`${consideration[i].token}:${consideration[i].identifier}`)) {
        return true;
      }
    }
    return false;
  }

  private async getFlagged() {
    const tokenIds = this.considerations.flat();
    return await fetchFlagged(tokenIds);
  }
}
