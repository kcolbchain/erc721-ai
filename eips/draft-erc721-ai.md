---
eip: <TBD — request from EIP editors>
title: Tokenized AI Model Weights (ERC-721 AI)
description: A token standard for representing ownership, provenance, and tradability of AI model weights, extending ERC-721.
author: Abhishek Krishna (@abhicris), Pattermesh (@Pattermesh), kcolbchain (@kcolbchain)
discussions-to: https://github.com/kcolbchain/erc721-ai/issues/22
status: Draft
type: Standards Track
category: ERC
created: 2026-05-24
requires: 165, 721, 2981, 4906
---

## Abstract

ERC-721 AI extends ERC-721 with a standardized metadata schema for AI model weights. Each token represents one model asset, identified by a content-addressed artifact hash, and exposes its weights pointer, base-model provenance, architecture, license, inference endpoint, and royalty information through a uniform on-chain interface.

The standard stays within the ERC-721 interface so model NFTs render in every existing wallet, marketplace, and indexer. Verifiable training claims (zero-knowledge proofs, TEE attestations) are out of scope and handled by a separate optional attestation hook.

## Motivation

The AI model ecosystem in 2026 lacks portable primitives for three concerns that on-chain token standards already solve for other asset types:

1. **Ownership.** Public model hubs list a single "author" string. Splitting rights between the dataset curator, the fine-tuner, and the infrastructure provider requires off-chain contracts and trust. ERC-721 with ERC-2981 already solves this for art; ERC-721 AI extends it to model weights.
2. **Provenance.** A consumer of `some-fine-tuned-llama-3` has no verifiable on-chain record of which base model was fine-tuned. ERC-721 AI records a provenance chain via the `baseModel` field referencing the parent token's `modelId`.
3. **Access and monetization.** Running inference today requires bespoke endpoint and API-key arrangements per model. ERC-721 AI exposes a standard `inferenceEndpoint()` URI and pairs cleanly with per-inference payment metering (see the related x402-based metering work).

ERC-721 AI is not a container for model weights. Weights are stored off-chain (IPFS, Arweave, model hubs, private storage). The token records the hash of the weights and the pointer to them. This keeps the on-chain footprint constant per model regardless of model size.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### Required metadata fields

Every ERC-721 AI token MUST expose the following fields, either via the reference contract's `modelAsset(tokenId)` getter or via the `tokenURI` JSON.

| Field | Type | Required | Description |
|---|---|---|---|
| `modelId` | `bytes32` | Yes | Canonical model identifier. RECOMMENDED: `keccak256(abi.encodePacked(creator, weightsCID))`. |
| `weightsCID` | `string` | Yes | Content identifier for the model weights (IPFS CID, Arweave tx id, model-hub repo + revision, HTTPS URL). |
| `artifactHash` | `bytes32` | Yes | `keccak256` of the serialized weights artifact. This binds the token to specific bytes. |
| `baseModel` | `bytes32` | No | `modelId` of the parent model if this is a fine-tune. Zero means no parent declared. |
| `architecture` | `string` | Yes | Free-form architecture name (`llama-3.1-70b-instruct`, `sdxl-base-1.0`, etc.). |
| `license` | `string` | Yes | License identifier. SPDX-compatible strings RECOMMENDED; model-specific identifiers (`LLAMA3-COMMUNITY`, `OPENRAIL`, etc.) MAY be used and SHOULD be in a registered prefix namespace. |
| `inferenceEndpoint` | `string` | No | HTTPS / onion / decentralized endpoint URL where inference against this model is served. Empty string if none. |
| `attestationKind` | `bytes32` | No | If an attestation is registered in the attestation hook, the kind (`ZK_PROOF`, `TEE_SIG`, etc.). |
| `creatorRoyaltyBps` | `uint16` | Yes | Basis points of secondary-sale proceeds owed to the creator per ERC-2981. MUST be ≤ 10000. |
| `createdAt` | `uint64` | Yes | Block timestamp at mint. |
| `creator` | `address` | Yes | Original minter; immutable after mint. |

### Required interface

```solidity
interface IERC721AI /* is IERC721, IERC2981, IERC4906 */ {
    event ModelMinted(
        uint256 indexed tokenId,
        bytes32 indexed modelId,
        bytes32 indexed artifactHash,
        address creator,
        string  weightsCID
    );
    event InferenceEndpointUpdated(uint256 indexed tokenId, string endpoint);
    event AttestationKindUpdated(uint256 indexed tokenId, bytes32 kind);

    /// @notice Mint a new ERC-721 AI token bound to a specific model artifact.
    /// @dev MUST revert if `to == address(0)`, `artifactHash == 0`, or
    ///      `creatorRoyaltyBps > 10000`.
    ///      The creator is `msg.sender`; immutable after mint.
    function mintModel(
        address to,
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 baseModel,
        string calldata weightsCID,
        string calldata architecture,
        string calldata license,
        string calldata inferenceEndpoint,
        uint16  creatorRoyaltyBps
    ) external returns (uint256 tokenId);

    /// @notice Return the full ModelAsset record for a token.
    function modelAsset(uint256 tokenId) external view returns (
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 baseModel,
        string memory weightsCID,
        string memory architecture,
        string memory license,
        string memory inferenceEndpoint,
        uint16 creatorRoyaltyBps,
        uint64 createdAt,
        address creator
    );

    /// @notice Update the inference endpoint. Callable only by the current
    ///         token owner. MUST emit InferenceEndpointUpdated and MUST also
    ///         emit ERC-4906's MetadataUpdate(tokenId).
    function setInferenceEndpoint(uint256 tokenId, string calldata endpoint) external;

    /// @notice Update the attestation kind. Callable only by the current
    ///         token owner. MUST emit AttestationKindUpdated and MetadataUpdate.
    function setAttestationKind(uint256 tokenId, bytes32 kind) external;
}
```

A compliant contract MUST also implement `IERC721` (transfers, ownership), `IERC2981` (royalty info), and SHOULD implement `IERC4906` (metadata-update events).

The ERC-165 interface identifier for `IERC721AI` is **`0x126985dd`**, computed as the XOR of the four selectors:

| Function | Selector |
|---|---|
| `mintModel(address,bytes32,bytes32,bytes32,string,string,string,string,uint16)` | `0x6270487f` |
| `modelAsset(uint256)` | `0x1f22cd92` |
| `setInferenceEndpoint(uint256,string)` | `0x2d256cf9` |
| `setAttestationKind(uint256,bytes32)` | `0x421e6cc9` |

A compliant contract MUST return `true` from `supportsInterface(0x126985dd)`.

### Token URI JSON schema

`tokenURI(tokenId)` SHOULD return JSON conformant to the following schema. Existing marketplaces will render `name` / `description` / `image`; ERC-721 AI-aware tooling SHOULD additionally parse the `model` object.

```json
{
  "name": "Llama-3.1-70B fine-tune on legal corpus v1",
  "description": "LoRA fine-tune on 1.4M legal documents.",
  "image": "ipfs://bafy.../card.png",
  "model": {
    "modelId": "0x…",
    "weightsCID": "ipfs://bafy.../weights/",
    "artifactHash": "0x…",
    "baseModel": "0x…",
    "architecture": "llama-3.1-70b-instruct",
    "license": "LLAMA3-COMMUNITY",
    "inferenceEndpoint": "https://inf.example.org/models/0x…",
    "attestationKind": "0x…",
    "creatorRoyaltyBps": 500,
    "createdAt": 1797609600,
    "creator": "0x…"
  }
}
```

### Royalties

`royaltyInfo(tokenId, salePrice)` MUST return `(creator, salePrice * creatorRoyaltyBps / 10000)`. The royalty recipient is the original creator, not the current owner. Marketplaces honoring ERC-2981 will route the basis-point share back to the creator on every secondary sale; ERC-2981 is advisory and not enforced on-chain by this standard.

### Mutability

Immutable after mint: `modelId`, `artifactHash`, `baseModel`, `weightsCID`, `architecture`, `license`, `creatorRoyaltyBps`, `createdAt`, `creator`.

Mutable by the current token owner: `inferenceEndpoint`, `attestationKind`. Each mutation MUST emit the corresponding update event plus ERC-4906 `MetadataUpdate(tokenId)`.

### Soulbound option

Implementations MAY add ERC-5192 (`IERC5192.locked(tokenId)`) to expose non-transferable model NFTs (provenance without resale). When `locked(tokenId)` returns `true`, every transfer function MUST revert. This is OPTIONAL; the base standard does not require ERC-5192 support.

## Rationale

### Strict ERC-721 superset

Existing wallets, marketplaces, and indexers already render ERC-721. Building on top means model NFTs are discoverable on day zero. A new token standard would require ecosystem adoption before a single model could be displayed.

### On-chain struct AND tokenURI JSON

The struct is the source of truth for verifiable fields (immutable). The JSON adds presentational fields (`name`, `description`, `image`) without bloating storage. Reading either yields the same model data.

### Optional `baseModel` rather than required provenance chain

Forcing every model to declare a parent breaks the bootstrap case (open base models have no on-chain parent). Optional `baseModel` lets the chain start somewhere; downstream tooling can recursively traverse declared parents.

### Attestation as a separate hook

Verifiable training claims (ZK proofs of training-data inclusion, TEE attestations of training pipelines) are a separate research surface. Bundling them into the asset layer would freeze a specific attestation scheme into the standard. The hook (`attestationKind` field plus a separate verifier contract) lets the attestation primitive evolve without breaking the asset standard.

### `string` for `inferenceEndpoint`

Strings let HTTPS, `.onion`, IPNS, libp2p multiaddrs, and bespoke routing schemes all participate. A structured type would force the spec to enumerate transport types, freezing the design.

### Creator and owner are separate

Owners can sell the token; the creator gets the royalty. ERC-2981 was designed for this pattern.

### ERC-4906 over a custom metadata-update event

The endpoint and attestation changes are exactly the case ERC-4906 was designed for. Reusing it instead of defining a new event keeps existing indexer tooling (OpenSea, Reservoir, etc.) working without modification.

### License normalization

The standard prefers SPDX identifiers but doesn't restrict to them, because real model licenses (LLAMA3-COMMUNITY, OPENRAIL, FALCON-LLM) are not in the SPDX list. The recommendation is a registered prefix namespace (`SPDX:`, `MODEL:`, etc.) so tooling can dispatch on the prefix. The standard does not mandate the registry; that work is left to ecosystem coordination.

### Royalty enforcement

ERC-2981 is advisory. A marketplace that ignores it is technically compliant with ERC-721 but not with the spirit of ERC-721 AI. The standard intentionally does not enforce royalties on-chain (e.g., via transfer hooks) because such enforcement breaks composability with marketplaces that don't know about the hook. A pull-pattern adapter (where the creator can claim accumulated royalties from a marketplace-specific contract) is a higher layer.

### Endpoint rotation has no time lock

A malicious post-purchase owner could redirect the inference endpoint to a poisoned server. The standard documents this risk in Security Considerations and emits a `MetadataUpdate` event so monitors can react, but it does not require a time-locked rotation. Time locks would block legitimate operational changes (provider rotation, DR) and add per-deployment complexity. Implementers worried about endpoint spoofing SHOULD pin the `artifactHash` and verify locally.

## Backwards Compatibility

ERC-721 AI is a strict superset of ERC-721. Tokens conforming to this standard MUST also conform to ERC-721 and SHOULD conform to ERC-2981 and ERC-4906. No existing ERC-721 implementations break.

A contract deployed before this EIP that exposes a subset of the metadata fields can be upgraded to compliance by adding the missing fields via a wrapper contract that delegates to the original.

## Reference Implementation

[`contracts/ERC721AI.sol`](../contracts/ERC721AI.sol) in the `kcolbchain/erc721-ai` repository. The contract is minimal and dependency-free for clarity; production deployments SHOULD substitute an audited ERC-721 base (e.g., OpenZeppelin) and inherit `ERC721AI` behavior.

Foundry tests at [`test/ERC721AI.t.sol`](../test/ERC721AI.t.sol) cover mint, provenance chain lookup, royalties, endpoint mutation, attestation kind mutation, transfer semantics, and revert paths.

A TypeScript SDK using viem lives at [`sdk/typescript/`](../sdk/typescript/) and exposes three modules (`model`, `metering`, `attestation`) for mint, price, pay, and withdraw operations.

## Test Cases

| Test | What it asserts |
|---|---|
| `test_mintModel_sets_immutable_fields` | After mint, `modelAsset(id)` returns the exact inputs; subsequent owners cannot mutate any of the immutable fields |
| `test_mintModel_revertsOnZeroAddress` | Mint to `address(0)` reverts |
| `test_mintModel_revertsOnZeroArtifactHash` | `artifactHash == 0` reverts |
| `test_mintModel_revertsOnRoyaltyOver100Pct` | `creatorRoyaltyBps > 10000` reverts |
| `test_provenance_chain_traversal` | A 3-deep parent chain resolves correctly via repeated `modelAsset().baseModel` lookups |
| `test_royaltyInfo_returnsCreator` | `royaltyInfo(id, 1 ether)` returns `(creator, 1 ether * bps / 10000)` after the token has been transferred to a new owner |
| `test_setInferenceEndpoint_onlyOwner` | A non-owner calling `setInferenceEndpoint` reverts |
| `test_setInferenceEndpoint_emitsERC4906` | `setInferenceEndpoint` emits both `InferenceEndpointUpdated` and ERC-4906 `MetadataUpdate(tokenId)` |
| `test_setAttestationKind_onlyOwner` | Same authorization rules as `setInferenceEndpoint` |
| `test_supportsInterface` | Returns `true` for ERC-165, ERC-721, ERC-2981, ERC-4906, and `0x126985dd`; `false` for unrelated ids |
| `test_transfer_preserves_creator` | After `safeTransferFrom`, the `creator` field is unchanged and royalty still routes to the original creator |

## Security Considerations

### Artifact-hash collision and weight tampering

`artifactHash` is `keccak256` of the serialized weights. Off-chain consumers MUST recompute the hash after fetching weights from `weightsCID` and reject any artifact whose computed hash does not match. The on-chain field is binding only to consumers who respect it.

### Inference-endpoint URL spoofing

`inferenceEndpoint` is owner-mutable. A malicious purchaser of a token may redirect inference to a different (potentially poisoned) endpoint. Mitigations:

- Consumers SHOULD pin the artifact hash and verify model output locally where feasible.
- Tooling SHOULD subscribe to the `InferenceEndpointUpdated` and ERC-4906 `MetadataUpdate` events and surface endpoint changes prominently in UI.
- Operators who want stronger guarantees SHOULD use the soulbound option (Section "Soulbound option") so the endpoint can only be changed by the original minter.

### Royalty enforcement

ERC-2981 is advisory. Marketplaces MAY ignore the royalty payment. This is a property of ERC-2981 and not specific to ERC-721 AI; the same concern applies to every art NFT standard.

### Attestation-hook trust model

The optional attestation-hook extension introduces a separate verifier contract. Its trust assumptions are documented in [`docs/attestation-hook.md`](../docs/attestation-hook.md). Implementers MUST NOT assume `attestationKind != 0` implies any verification; consumers MUST query the registered verifier.

### Front-running mint

The recommended `modelId = keccak256(creator, weightsCID)` is deterministic given the creator's address. A front-runner cannot forge a collision unless they control either side of the preimage. If a custom `modelId` scheme is used, the implementation SHOULD enforce uniqueness within the contract via a `modelId => tokenId` mapping.

### Provenance-chain forgery

`baseModel` is a free `bytes32` field. A malicious minter may declare any prior model as their base. Tooling SHOULD validate that the declared base actually exists as a minted token and SHOULD surface the chain visually (e.g., show the parent's `architecture` and `creator` in the UI).

### License-string spoofing

The `license` field is a free string. A minter may declare a permissive license while actually fine-tuning a model whose underlying weights are licensed restrictively. This is a legal-rights concern outside the contract's scope; downstream tooling MAY cross-reference the declared `baseModel`'s license to surface inconsistencies.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
