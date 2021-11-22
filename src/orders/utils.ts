import { keccak256 } from "@ethersproject/solidity";

type Token = {
  contract: string;
  tokenId: string;
};

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling, the id of any
// particular token set should be set as the hash of its underlying
// tokens (the only exception will be collection-wide orders for which
// the tokens within the set can change and thus, the id of the token
// set should be set to something static, eg. collection id).
export const generateTokenSetId = (tokens: Token[]) => {
  const tokenHashes: string[] = [];
  for (const { contract, tokenId } of tokens) {
    tokenHashes.push(keccak256(["address", "uint256"], [contract, tokenId]));
  }
  return keccak256(["bytes32[]"], [tokenHashes]);
};
