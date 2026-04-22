# ERC-721 AI — Draft Token Standard Specification

**Status:** Draft (2026-04-18)
**Authors:** kcolbchain
**Addresses:** `kcolbchain/erc721-ai#1`, `kcolbchain/erc721-ai#2`
**Extends:** [ERC-721](https://eips.ethereum.org/EIPS/eip-721)
**References:** [ERC-4906 (metadata update)](https://eips.ethereum.org/EIPS/eip-4906), [ERC-5192 (soulbound)](https://eips.ethereum.org/EIPS/eip-5192), [ERC-2981 (royalties)](https://eips.ethereum.org/EIPS/eip-2981), `kcolbchain/erc721-ai` attestation-hook extension.

---

## 1. Abstract

ERC-721 AI is a token standard for tokenized AI model weights. Each token represents **one model asset**: a fine-tuned or base model identified by a content-addressed artifact hash, with its ownership, provenance, inference endpoint, and license recorded on-chain in a standardized way.

It intentionally stays within the ERC-721 interface so model-asset NFTs render in every existing NFT wallet, marketplace, and indexer. Verifiability (did this model actually train on what the metadata claims?) is handled by the separate attestation-hook extension already in this repo; this spec defines only the **asset layer**.

## 2. Motivation

The AI model ecosystem today has three weak points that a token standard addresses cleanly:

1. **Ownership** — HuggingFace model pages list a single "author"; there is no way to split ownership between the dataset curator, the fine-tuner, and the infrastructure provider. ERC-721 AI encodes ownership in the token and royalties via ERC-2981.
2. **Provenance** — a downstream user of `some-fine-tuned-llama-3` has no on-chain record of which base model was fine-tuned, on what data, or with what parameters. ERC-721 AI records a **provenance chain** (pointer to parent model token + fine-tuning receipt hash).
3. **Access / monetization** — running inference against a fine-tuned model today requires a bespoke endpoint + API key arrangement per model. ERC-721 AI exposes a standard `inferenceEndpoint()` URI and couples cleanly with the separate x402 per-inference metering work (see `#9`).

ERC-721 AI is **not** a container for model weights. Weights are stored off-chain (IPFS / Arweave / HuggingFace / private). The token records the *hash* of the weights and the *pointer* to them.

## 3. Specification

### 3.1 Required metadata fields

Every ERC-721 AI token MUST expose the following fields, either on-chain via the reference contract's `modelAsset(tokenId)` getter, or in the `tokenURI` JSON per ERC-721 convention.

| Field | Type | Required | Description |
|---|---|---|---|
| `modelId` | `bytes32` | Yes | Canonical model identifier. Typically `keccak256(<creator addr> \|\| <weights CID>)`; MAY be any globally-unique identifier. |
| `weightsCID` | `string` | Yes | Content identifier for the model weights (IPFS CID, Arweave tx id, HuggingFace repo + revision, or HTTPS URL). |
| `artifactHash` | `bytes32` | Yes | `keccak256` of the serialized weights artifact. This is the **hash that locks the token to specific weights**. |
| `baseModel` | `bytes32` | No | `modelId` of the parent model, if this is a fine-tune. Zero means "no parent declared." |
| `architecture` | `string` | Yes | Free-form architecture name (`llama-3.1-70b-instruct`, `sdxl-base-1.0`, `custom-mixture-of-experts`, etc). |
| `license` | `string` | Yes | SPDX-compatible license identifier (`MIT`, `Apache-2.0`, `LLAMA3-COMMUNITY`, `PROPRIETARY`). |
| `inferenceEndpoint` | `string` | No | HTTPS / onion / decentralized endpoint URL where inference against this model is served. Empty string if none. |
| `attestationKind` | `bytes32` | No | If an attestation is registered in the attestation-hook, the kind (`ZK_PROOF`, `TEE_SIG`, etc). |
| `creatorRoyaltyBps` | `uint16` | Yes | Basis points of secondary-sale proceeds owed to the creator per ERC-2981. |
| `createdAt` | `uint64` | Yes | Block timestamp at mint. |

### 3.2 On-chain struct layout (reference)

```solidity
struct ModelAsset {
    bytes32 modelId;
    bytes32 artifactHash;
    bytes32 baseModel;        // parent modelId, or zero
    string  weightsCID;
    string  architecture;
    string  license;
    string  inferenceEndpoint;
    bytes32 attestationKind;
    uint16  creatorRoyaltyBps;
    uint64  createdAt;
    address creator;          // original minter; immutable
}
```

The `creator` field is stored separately from the ERC-721 owner so royalties stay with the creator after a transfer.

### 3.3 Token URI JSON schema

`tokenURI(tokenId)` SHOULD return JSON conformant to the following schema. Existing marketplaces will render the `name`, `description`, `image` fields; ERC-721 AI-aware tooling SHOULD additionally parse the `model` object.

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

### 3.4 Required interface

```solidity
interface IERC721AI /* is IERC721, IERC2981 */ {
    event ModelMinted(
        uint256 indexed tokenId,
        bytes32 indexed modelId,
        bytes32 indexed artifactHash,
        address creator,
        string weightsCID
    );

    event InferenceEndpointUpdated(uint256 indexed tokenId, string endpoint);

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

### 3.5 Provenance chain

When `baseModel` is non-zero, it MUST reference an existing ERC-721 AI token's `modelId` **on the same contract**. Implementations MAY relax this to allow cross-contract references in a later revision; v0 keeps it same-contract for unambiguous chain traversal.

A downstream indexer can walk the provenance chain by repeatedly looking up `modelAsset(tokenId).baseModel → find token with that modelId → ...` until `baseModel == 0`.

### 3.6 Royalties

ERC-721 AI MUST implement ERC-2981 (`royaltyInfo(tokenId, salePrice)`). The royalty receiver is the stored `creator` address (not the current owner). This preserves the fine-tuner's economic interest across resales.

Resale markets MUST forward royalties per ERC-2981 for the spec to hold — enforcement is out of scope.

### 3.7 Attestation hook integration

Implementations SHOULD register verifiable-training attestations via the existing `ERC721AIAttestationHook` contract in this repo. When an attestation is registered for a token, the `attestationKind` field SHOULD be updated on the model asset record to reflect the kind of attestation present (e.g., `keccak256("ZK_PROOF")`, `keccak256("TEE_SIG")`).

### 3.8 Security considerations

1. **Weights tampering.** The `artifactHash` locks the token to specific weights. Any mutation of the weights bundle breaks the hash commitment. Indexers SHOULD re-verify the hash before trusting weights fetched from `weightsCID`.
2. **Endpoint mutability.** `inferenceEndpoint` is mutable by the token owner. A malicious seller could flip the endpoint to a degraded model between sale and first buyer use. Buyers should re-verify the endpoint serves weights hashing to `artifactHash` (via the standard "echo model hash" ping defined in §3.9).
3. **Royalty evasion.** ERC-2981 is advisory; marketplaces MAY ignore it. Creators should not treat the royalty as a guaranteed cash stream.
4. **Provenance-chain spoofing.** A malicious minter could declare an arbitrary `baseModel` to inflate lineage claims. Attestations (§3.7) are the cryptographic counter — a `ZK_PROOF` attestation ties weights to a specific training job.

### 3.9 Echo-model-hash endpoint convention (optional)

For endpoints that expose inference over HTTP, the standard hints at a convention: an `OPTIONS /model-hash` (or equivalent) response that returns the `artifactHash` and a short signature over the server's timestamp. Defining the wire format is out of scope for v0 — left to a companion draft.

## 4. Backwards compatibility

ERC-721 AI is additive. An ERC-721 AI contract IS an ERC-721 contract, so existing wallets, marketplaces, and indexers continue to render model-asset tokens as ordinary NFTs. Only ERC-721-AI-aware tooling reads the `model` object.

## 5. Reference implementation

See `contracts/ERC721AI.sol` in this repo for a minimal reference. Tests in `test/ERC721AI.t.sol` cover mint / transfer / royalty / endpoint-update / provenance-chain lookup.

## 6. Open questions (v0 → v1)

- Should weights be referenced by CID or by a pair `(registry, repoId)` (so HuggingFace-style references are first-class)?
- Should multiple royalty recipients be supported (data curator + fine-tuner + infra provider split)? ERC-2981 is single-recipient; `ERC-2981 extensions` exist as proposals but none are standard yet.
- Soulbound models — should a model asset be non-transferable by default while training is in progress (ERC-5192 integration)?
- Cross-contract provenance chains.
- Echo-model-hash endpoint wire format.

These are deferred to a v1 draft once v0 is in production use.
