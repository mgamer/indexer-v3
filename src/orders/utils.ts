import { keccak256 } from "@ethersproject/solidity";

import { Token } from "@/common/types";

// Orders are associated to a token set (eg. a set of tokens the order
// can be filled on). To make things easy for handling, the id of any
// particular token set should be a deterministic identifier based on
// the underlying tokens within the set. We support two types of sets:
// - token list sets: an immutable set of tokens having as id the hash
//   of its underlying tokens (these are powering single-token orders
//   and attribute orders)
// - token range sets: a mutable set of tokens having as id the hash of
//   the range description (these are powering collection-wide orders)

export const generateTokenListSetId = (tokens: Token[]) => {
  const tokenHashes: string[] = [];
  for (const { contract, tokenId } of tokens) {
    tokenHashes.push(keccak256(["address", "uint256"], [contract, tokenId]));
  }
  return keccak256(["bytes32[]"], [tokenHashes]);
};

export const generateTokenRangeSetId = (
  contract: string,
  startTokenId: string,
  endTokenId: string
) => {
  return keccak256(
    ["address", "uint256", "uint256"],
    [contract, startTokenId, endTokenId]
  );
};
