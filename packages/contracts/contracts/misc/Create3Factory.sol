// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.13;

import {CREATE3} from "solmate/src/utils/CREATE3.sol";

contract Create3Factory {
  function deploy(
    bytes32 salt,
    bytes memory creationCode
  ) external payable returns (address deployed) {
    salt = keccak256(abi.encodePacked(salt, creationCode));
    return CREATE3.deploy(salt, creationCode, msg.value);
  }

  function getDeployed(
    bytes32 salt,
    bytes calldata creationCode
  ) external view returns (address deployed) {
    salt = keccak256(abi.encodePacked(salt, creationCode));
    return CREATE3.getDeployed(salt);
  }
}
