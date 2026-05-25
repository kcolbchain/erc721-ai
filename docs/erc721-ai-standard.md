# ERC-721 AI Token Standard — Specification Draft

**Status:** Draft v0.2
**Extends:** ERC-721, ERC-2981
**Repository:** kcolbchain/erc721-ai

## 1. Abstract

ERC-721 AI extends the ERC-721 NFT standard to represent tokenized AI model weights. Each token is a **model asset** — a uniquely identified set of model weights with on-chain provenance, royalty rights, and an optional inference endpoint. The standard enables ownership, transfer, and monetization of fine-tuned models as programmable digital assets.

## 2. Motivation

The AI model ecosystem lacks a standardized ownership and provenance layer:

- **No portable ownership**: model authorship is tracked on centralized platforms (HuggingFace) with no on-chain representation
- **No provenance chain**: downstream fine-tunes cannot cryptographically reference their base model
- **No standard monetization**: inference access requires bespoke arrangements per model

A token standard solves all three by mapping each model to an NFT with rich metadata, provenance, and royalty mechanics.

## 3. Metadata Schema

### 3.1 On-Chain Fields

Every ERC-721 AI token exposes the following via `modelAsset(tokenId)`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `modelId` | `bytes32` | Yes | Unique model identifier (`keccak256(creator \|\| weightsCID)`) |
| `artifactHash` | `bytes32` | Yes | `keccak256` of serialized weights — locks token to specific weights |
| `baseModel` | `bytes32` | No | Parent model's `modelId` (zero = no parent declared) |
| `weightsCID` | `string` | Yes | CID or URL pointer to weights artifact |
| `architecture` | `string` | Yes | Architecture name (e.g., `llama-3.1-70b-instruct`) |
| `license` | `string` | Yes | SPDX or custom license identifier |
| `inferenceEndpoint` | `string` | No | URL where inference is served (mutable by owner) |
| `attestationKind` | `bytes32` | No | Attestation type (`ZK_PROOF`, `TEE_SIG`, etc.) |
| `creatorRoyaltyBps` | `uint16` | Yes | Royalty basis points per ERC-2981 |
| `createdAt` | `uint64` | Yes | Block timestamp at mint |
| `creator` | `address` | Yes | Original minter (immutable, for royalty payouts) |

### 3.2 JSON Token URI Schema

```json
{
  "name": "Llama-3.1-70B fine-tune on legal corpus v1",
  "description": "LoRA fine-tune on 1.4M legal documents.",
  "image": "ipfs://bafy.../card.png",
  "model": {
    "modelId": "0x...",
    "weightsCID": "ipfs://bafy.../weights/",
    "artifactHash": "0x...",
    "baseModel": "0x...",
    "architecture": "llama-3.1-70b-instruct",
    "license": "LLAMA3-COMMUNITY",
    "inferenceEndpoint": "https://inf.example.org/models/0x...",
    "attestationKind": "0x...",
    "creatorRoyaltyBps": 500,
    "createdAt": 1797609600,
    "creator": "0x..."
  }
}
```

## 4. Core Interface

```solidity
interface IERC721AI {
    event ModelMinted(uint256 indexed tokenId, bytes32 indexed modelId, bytes32 indexed artifactHash, address creator);
    event InferenceEndpointUpdated(uint256 indexed tokenId, string endpoint);
    event AttestationRegistered(uint256 indexed tokenId, bytes32 kind);

    function mintModel(
        address to,
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 baseModel,
        string calldata weightsCID,
        string calldata architecture,
        string calldata license,
        string calldata inferenceEndpoint,
        uint16 creatorRoyaltyBps
    ) external returns (uint256 tokenId);

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

    function setInferenceEndpoint(uint256 tokenId, string calldata endpoint) external;
}
```

## 5. Provenance Chain

When `baseModel` is non-zero, it references the parent model's `modelId` on the same contract. The chain can be traversed:

```
Token 1 (baseModel = 0) ← Token 2 (baseModel = modelId_1) ← Token 3 (baseModel = modelId_2)
```

A downstream indexer walks: `modelAsset(n).baseModel → find token with matching modelId → repeat until baseModel == 0`.

## 6. Royalties

ERC-721 AI implements ERC-2981 with the `creator` as the royalty receiver (not current owner). This ensures the fine-tuner retains economic interest across resales.

```
royaltyInfo(tokenId, salePrice) → (creator, salePrice * creatorRoyaltyBps / 10000)
```

## 7. Attestation Hook Integration

Implementations SHOULD register training attestations via `ERC721AIAttestationHook`. When registered, `attestationKind` is updated to reflect the attestation type:

- `keccak256("ZK_PROOF")` — zero-knowledge proof of training
- `keccak256("TEE_SIG")` — TEE-signed training attestation

## 8. Security Considerations

| Risk | Mitigation |
|------|------------|
| Weights tampering | `artifactHash` locks weights; indexers should re-verify |
| Endpoint swapping | Buyers re-verify endpoint serves correct weights |
| Royalty evasion | ERC-2981 is advisory; enforcement is marketplace-dependent |
| Provenance spoofing | Attestations provide cryptographic verification |
| Creator identification | `creator` is set at mint and immutable |

## 9. Reference Implementation

See `contracts/ERC721AI.sol` for a minimal Foundry-compiled reference. Tests in `test/ERC721AI.t.sol`.

## 10. Open Questions

1. Should `weightsCID` support multi-registry identifiers (e.g., HuggingFace `org/model`)?
2. Should multiple royalty recipients be supported?
3. Should tokens be soulbound during training (ERC-5192)?
4. Should cross-contract provenance be allowed?

These are deferred to v1.

## 11. References

- ERC-721: https://eips.ethereum.org/EIPS/eip-721
- ERC-2981: https://eips.ethereum.org/EIPS/eip-2981
- ERC-4906: https://eips.ethereum.org/EIPS/eip-4906
- Reference implementation: `contracts/ERC721AI.sol`
- Attestation hook: `docs/attestation-hook.md`
