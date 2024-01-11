export interface MintConfig {
  maxSupply?: number; // max supply for the collection
  maxMintPerWallet?: number; // max mint per wallet for the collection
  maxMintPerTransaction?: number; // max mint per transaction for all phases
  phases: MintPhase[]; // the mint phases
}

export interface MintPhase {
  maxMintsPerWallet?: number; // limit of mint per wallet for this phase
  maxMintPerTransaction?: number; // max mint per transaction for this phases
  startTime: number | ContractCall; // timestamp, in seconds, for start mint phase
  endTime: number | ContractCall; // timestamp, in seconds, for end mint phase
  price?: string | ContractCall; // in wei
  currency?: string; // contract address, undefined or address(0) if native
  tx: TxBuild; // the data to build the transaction to mint
  tokenId?: string; // the token id if ERC1155
}

export interface ContractCall {
  abi: any;
  functionName: string;
  to?: string;
  inputs?: any[];
  // pathToValue: string;
}

export interface TxBuild {
  to?: string; // what contract to call. if undefined, current collection. if defined, must satisfy the regex /0x[a-fA-F0-9]{40}/
  method: string; // method signature, must satisfy the regex: /0x[a-f0-9]{8}/
  params?: TxParam[]; // the params to build the transaction
}

export interface TxParam {
  name: string; // name of the param, to display to the users if needed
  abiType: string; // abi type to encode it
  value?: any; // value for that parameter. type must satisfy "abiType". if set, kind and values are ignored.
  kind?: string; // keyword for some kind of params
  values?: TxParamValues; // the possible values.
}

export type TxParamValues = { [k: string]: any } | TxParamValuesOption[];

export type TxParamValuesOption = { label: string; value: any }; // value type must satisfy the abiType for that TxParam

export type BuilderConfig = {
  provider: any;
  collection: string;
};
