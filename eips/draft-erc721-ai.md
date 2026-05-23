---
eip: <TBD — request from EIP editors>
title: Tokenized AI Model Weights (ERC-721 AI)
description: A token standard for representing ownership, provenance, and tradability of fine-tuned AI model weights, extending ERC-721.
author: kcolbchain (@kcolbchain), Abhishek Krishna (@abhicris), Pattermesh (@Pattermesh)
discussions-to: https://ethereum-magicians.org/<TBD>
status: Draft
type: Standards Track
category: ERC
created: 2026-05-24
requires: 165, 721, 2981
---

> **Status note (kcolbchain internal):** Working draft on branch [`eip`](https://github.com/kcolbchain/erc721-ai/tree/eip). The v0 design lives in [`docs/spec-erc721-ai.md`](../docs/spec-erc721-ai.md); the reference Solidity implementation is on `main` at [`contracts/ERC721AI.sol`](../contracts/ERC721AI.sol). The job of this document is to translate the spec into the EIP-1 template so it can be submitted to [`ethereum/EIPs`](https://github.com/ethereum/EIPs).
>
> Owner: **@abhicris**. Open questions are numbered OQ-1 through OQ-7 in §11.

## Abstract

ERC-721 AI extends ERC-721 with a standardized metadata schema for **tokenized AI model weights**. Each token represents one model asset — identified by a content-addressed artifact hash — and exposes its weights pointer, base-model provenance, architecture, license, inference endpoint, and royalty information through a uniform on-chain interface.

The standard intentionally stays within the ERC-721 interface so model NFTs render in every existing wallet, marketplace, and indexer. Verifiable training claims (ZK / TEE) are handled by a separate, optional attestation-hook extension.

## Motivation

The AI model ecosystem today lacks portable primitives for:

1. **Ownership** — HuggingFace model pages list a single "author"; there is no way to split ownership between the dataset curator, the fine-tuner, and the infrastructure provider. ERC-721 AI encodes ownership in the token and royalties via ERC-2981.
2. **Provenance** — a downstream user of `some-fine-tuned-llama-3` has no on-chain record of which base model was fine-tuned, on what data, or with what parameters. ERC-721 AI records a **provenance chain** (pointer to parent model token + content-addressed artifact hash).
3. **Access / monetization** — running inference against a fine-tuned model today requires a bespoke endpoint + API key arrangement per model. ERC-721 AI exposes a standard `inferenceEndpoint()` URI and couples cleanly with per-inference metering work (e.g. x402-based pull payments — see `kcolbchain/erc721-ai#14`).

ERC-721 AI is **not** a container for model weights. Weights are stored off-chain (IPFS / Arweave / HuggingFace / private). The token records the *hash* of the weights and the *pointer* to them.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### 3.1 Required metadata fields

Every ERC-721 AI token MUST expose the following fields, either on-chain via the reference contract's `modelAsset(tokenId)` getter, or in the `tokenURI` JSON per ERC-721 convention.

| Field | Type | Required | Description |
|---|---|---|---|
| `modelId` | `bytes32` | Yes | Canonical model identifier. Typically `keccak256(<creator addr> ‖ <weightsCID>)`; MAY be any globally-unique identifier. |
| `weightsCID` | `string` | Yes | Content identifier for the model weights (IPFS CID, Arweave tx id, HuggingFace repo+revision, HTTPS URL). |
| `artifactHash` | `bytes32` | Yes | `keccak256` of the serialized weights artifact. This is the hash that **locks the token to specific weights**. |
| `baseModel` | `bytes32` | No | `modelId` of the parent model, if this is a fine-tune. Zero means "no parent declared." |
| `architecture` | `string` | Yes | Free-form architecture name (`llama-3.1-70b-instruct`, `sdxl-base-1.0`, etc). |
| `license` | `string` | Yes | SPDX-compatible license identifier (`MIT`, `Apache-2.0`, `LLAMA3-COMMUNITY`, `PROPRIETARY`). |
| `inferenceEndpoint` | `string` | No | HTTPS / onion / decentralized endpoint URL where inference against this model is served. Empty string if none. |
| `attestationKind` | `bytes32` | No | If an attestation is registered in the attestation-hook, the kind (`ZK_PROOF`, `TEE_SIG`, etc). |
| `creatorRoyaltyBps` | `uint16` | Yes | Basis points of secondary-sale proceeds owed to the creator per ERC-2981. |
| `createdAt` | `uint64` | Yes | Block timestamp at mint. |
| `creator` | `address` | Yes | Original minter; immutable after mint. |

### 3.2 Required interface

```solidity
interface IERC721AI /* is IERC721, IERC2981 */ {
    event ModelMinted(
        uint256 indexed tokenId,
        bytes32 indexed modelId,
        bytes32 indexed artifactHash,
        address creator,
        string  weightsCID
    );
    event InferenceEndpointUpdated(uint256 indexed tokenId, string endpoint);
    event AttestationKindUpdated(uint256 indexed tokenId, bytes32 kind);

    /// Mints a new ERC-721 AI token bound to a specific model artifact.
    /// MUST revert if `artifactHash == 0`, `to == address(0)`, or
    /// `creatorRoyaltyBps > 10000`.
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

    /// Returns the full ModelAsset struct for a token.
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

    /// MAY be called only by the current owner; emits InferenceEndpointUpdated.
    function setInferenceEndpoint(uint256 tokenId, string calldata endpoint) external;

    /// MAY be called only by the current owner; emits AttestationKindUpdated.
    function setAttestationKind(uint256 tokenId, bytes32 kind) external;
}
```

A compliant contract MUST also implement `IERC721` (transfers, ownership) and `IERC2981` (royalty info).

### 3.3 Token URI JSON schema

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

### 3.4 ERC-165 support

`supportsInterface(0xTBD)` MUST return `true` for the XOR of every selector in `IERC721AI`. The interface id will be computed and pinned in the final draft.

### 3.5 Royalties (ERC-2981)

`royaltyInfo(tokenId, salePrice)` MUST return `(creator, salePrice * creatorRoyaltyBps / 10000)`. The royalty recipient is the **original creator**, not the current owner; this allows secondary trades while preserving creator economics.

### 3.6 Mutability

- `modelId`, `artifactHash`, `baseModel`, `weightsCID`, `architecture`, `license`, `createdAt`, `creator`, `creatorRoyaltyBps` are **immutable** after mint.
- `inferenceEndpoint` and `attestationKind` MAY be updated by the current owner.

## Rationale

### Why a strict ERC-721 superset

Existing wallets, marketplaces, and indexers already render ERC-721. Building on top means model NFTs are discoverable on day zero. The alternative — a new token standard — would require ecosystem adoption before a single model could be displayed.

### Why on-chain struct AND tokenURI JSON

The struct is the source of truth for verifiable fields (immutable). The JSON adds presentational fields (`name`, `description`, `image`) without bloating storage. Reading either yields the same model data.

### Why optional `baseModel` rather than required provenance chain

Forcing every model to declare a parent breaks the bootstrap case (open base models like Llama-3 have no on-chain parent). Optional `baseModel` lets the chain start somewhere; downstream tooling can recursively traverse declared parents.

### Why decouple attestation into a hook

Verifiable training claims (ZK proofs of training-data inclusion, TEE attestations of training pipelines) are a separate research surface. Bundling them into the asset layer would freeze a specific attestation scheme into the standard. The hook (`attestationKind` field + separate hook contract) lets the attestation primitive evolve without breaking the asset standard.

### Why `string` for `inferenceEndpoint` and not a structured URI type

Strings let HTTPS, `.onion`, IPNS, libp2p multiaddrs, and bespoke routing schemes all participate. A structured type would force the spec to enumerate transport types, freezing the design.

### Why creator and owner are separate

Owners can sell the token; the creator is who gets the royalty. ERC-2981 was designed for this pattern.

## Backwards Compatibility

ERC-721 AI is a strict superset of ERC-721. Tokens conforming to this standard MUST also conform to ERC-721 and SHOULD conform to ERC-2981. No existing ERC-721 implementations break.

## Reference Implementation

[`contracts/ERC721AI.sol`](../contracts/ERC721AI.sol) in the `kcolbchain/erc721-ai` repository. The contract is minimal and dependency-free for clarity; production deployments SHOULD substitute an audited ERC-721 base (e.g., OpenZeppelin) and inherit `ERC721AI` behavior.

Foundry tests at [`test/ERC721AI.t.sol`](../test/ERC721AI.t.sol) cover mint, provenance chain lookup, royalties, endpoint mutation, attestation kind mutation, transfer semantics, and revert paths.

A TypeScript SDK using viem lives at [`sdk/typescript/`](../sdk/typescript/) — three modules (`model`, `metering`, `attestation`) for mint / price / pay / withdraw in roughly five lines.

## Security Considerations

### Artifact hash collision and weight tampering

`artifactHash` is `keccak256(weights)`. Off-chain consumers MUST recompute the hash after fetching weights from `weightsCID` and reject any artifact whose computed hash does not match. The on-chain field is binding only to whoever respects it.

### Inference endpoint URL spoofing

`inferenceEndpoint` is owner-mutable; a malicious purchaser of a token MAY redirect inference to a different (potentially poisoned) endpoint. Mitigations:

- Consumers SHOULD pin the artifact hash and verify locally where feasible.
- Tooling SHOULD warn on endpoint changes via the `InferenceEndpointUpdated` event.

### Royalty enforcement

ERC-2981 is advisory. Marketplaces MAY ignore the royalty payment. This is a property of ERC-2981 and not specific to ERC-721 AI.

### Attestation hook trust model

The optional attestation-hook extension introduces a separate verifier contract. Its trust assumptions are out of scope for this EIP and documented in [`docs/attestation-hook.md`](../docs/attestation-hook.md). Implementers MUST NOT assume that `attestationKind != 0` implies any verification; consumers MUST query the registered verifier.

### Front-running mint

`modelId` is `keccak256(creator ‖ weightsCID)` by convention; a front-runner cannot forge a collision unless they control either side of the preimage. If a custom `modelId` scheme is used, the implementation SHOULD enforce uniqueness within the contract.

### Provenance chain forgery

`baseModel` is a free `bytes32` field; a malicious minter MAY declare any prior model as their base. Tooling SHOULD validate that the declared base actually exists and is owned by an entity authorized to be claimed as a parent (when applicable).

## Open Questions (TODOs for @abhicris)

- **OQ-1: Interface ID.** Compute and pin the final ERC-165 selector once the interface is frozen.
- **OQ-2: Royalty pull vs push.** ERC-2981 returns `(recipient, amount)`; some marketplaces push, some pull. Should the standard recommend a pull-pattern adapter?
- **OQ-3: Endpoint rotation policy.** Should the spec require a time-locked window for endpoint changes (e.g., 24h announcement before taking effect) to mitigate URL spoofing?
- **OQ-4: License normalization.** SPDX is broad but doesn't cover model-specific licenses (LLAMA3-COMMUNITY, OPENRAIL). Should the spec maintain a curated registry of acceptable license strings?
- **OQ-5: ERC-4906 metadata-update events.** Should this EIP also require ERC-4906 emits on `setInferenceEndpoint` / `setAttestationKind`?
- **OQ-6: Soulbound option (ERC-5192).** Some model creators want non-transferable model NFTs (provenance without resale). Should the spec support an opt-in soulbound flag?
- **OQ-7: ethereum-magicians thread.** Open the discussion thread, paste the URL into the `discussions-to:` frontmatter.
- **Submit.** Open a PR against [`ethereum/EIPs`](https://github.com/ethereum/EIPs) with the finalized draft. Tag Pattermesh as co-author. Link the PR back to issue #22.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
