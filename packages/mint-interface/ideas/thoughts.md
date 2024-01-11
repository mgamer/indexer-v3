## mint(to, quantity) and mint(to, quantity, extraData)

Two function to mint, one very simple mint(to, quantity) that woul

extraData is a bytes and can represent anything. Not restricted to be a proof or a signature.

The configuration file could indicate how that extraData must be built using abi like

## Configuration

Mint / Collection configuration could be set in a configuration file and emitted as an event / retrievable with a getter.

the configuration file would contain data about the collection configuration: with a global configuration, some phases and a per phrase configuration.

```ts
interface Configuration {
	maxMintsPerWallet: number;
	maxSupply: number;
	startTime?: number;
	endTime?: number;
	price?: string;
	currency?: string; // (default to native)
}

interface PhaseConfiguration extends Configuration {
	extraData? : ExtraData
	ownerOf?: OwnerOf
}

type ExtraData = `0x${string}` | Record<string, `0x${string}`> | ExtraDataParams[]

type ExtraDataParams {
	name: string;
	abiType: string;
	value?: string | number;
	values: Record<string, `0x${string}`> | any[]
}

const start =  +(new Date('Tue Dec 05 2023 13:00:00 GMT+0100 (heure normale d’Europe centrale)'));
{
	maxMintsPerWallet: 5, // global config
	maxSupply: 10000, // global config
	phases: [
		{
			maxMintsPerWallet: 1, // specific to phase config
			startTime: start,
			endTime: start + 60 * 60 * 1000,
			extraData: {
				"0xdeadbeef1": "0x00000000000000000000000000000000000000",
				"0xdeadbeef2": "0x00000000000000000000000000000000000000",
				"0xdeadbeef3": "0x00000000000000000000000000000000000000",
				"0xdeadbeef4": "0x00000000000000000000000000000000000000",
			}
		},
		{
			maxMintsPerWallet: 1,
			startTime: start + 60 * 60 * 1000,
			endTime: start + 2 * 60 * 60 * 1000,
			extraData: {
				"0xdeadbeef1": "0x00000000000000000000000000000000000000",
				"0xdeadbeef2": "0x00000000000000000000000000000000000000",
				"0xdeadbeef3": "0x00000000000000000000000000000000000000",
				"0xdeadbeef4": "0x00000000000000000000000000000000000000",
			}
		},
		{
			startTime: start + 2 * 60 * 60 * 1000,
			endTime: start + 2 days,
			extraData: [
				{ name: "arbitraryValue", abiType: "uint256", value: 42 },
				{ name: "comment", abiType: "string" },
				{ name: "theme", abiType: "string", values: ['red', 'green',' blue', 'gold']}
			]
		}
	]
}
```

## Phases

The file would also contain any data about "phases".

Each phase has its own configuration that is speific to that phase and overrides the global config (except for the max).

It can also contain an "extraData" field that can either be:

- a bytes, that would be the same for all mint and give information to the contract, for example something that the contract would cast into an uint256 and would represent a "project id"
- a mapping address => extraData (bytes) that the contract will know how to decode (this can be a merkleproof or a signature or anything else specific to this user).
- a list of parameters, with { name, abiType, value? } that would need to be abi.encoded together to be passed to the contract and that any interface would be able to offer to the user to edit (similar to the tx.details in the calldata mints of the reservoir indexer)

For example for comment extraData would be: `[{name: 'comment', abiType: 'string'}]` that would allow Reservoir to know they need to offer a "Comment" field to the user.
Another example would be to force the current "id" to mint an ERC1155: `[{ name: "id", abiType: "uint256", value: 2 }]`
Another example would be to force the current "project id" (for artblocks for example): `[{ name: "projectId", abiType: "uint256", value: 483 }]`

...

## "Two functions" Alternative

As an alternative to the two functions mint(to, quantity)/mint(to, quantity, bytes) Phases could have something similar to the tx.details of the indexer

- signature
- params

  {
  maxMintsPerWallet,
  maxSupply,
  startTime,
  endTime,
  extraData: {
  "0xdeadbeef1": "0x00000000000000000000000000000000000000",
  "0xdeadbeef2": "0x00000000000000000000000000000000000000",
  "0xdeadbeef3": "0x00000000000000000000000000000000000000",
  "0xdeadbeef4": "0x00000000000000000000000000000000000000",
  }

## Things to maybe take from?

I created something for Premint a few months ago to make collections "PremintReady", so users could mint directly through Premint.

The idea was to create a small library that developers could implement on their contract to allow Premint to directly communicate with the contract using the allowlist created on premint.
The administrator of a contract would only need to make one signature, and the full allowlist would be signed, including phases etc....

It was used on one contract, worked well, but then they focused on something else and never went back to it.

https://etherscan.io/address/0xC178994cB9b66307Cd62dB8b411759Dd36D9C2EE#code#F24#L1
