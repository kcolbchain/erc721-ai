import type { Address, Hash, Hex } from 'viem';

/**
 * Deployment addresses for a given erc721-ai target.
 *
 * - `erc721ai` — the `ERC721AI` model-asset NFT contract (required).
 * - `metering` — the `ERC721AIx402Metering` per-inference USDC contract
 *   (required for `MeteringModule`).
 * - `attestation` — the `ERC721AIAttestationHook` contract (optional; only
 *   needed if you use `AttestationModule`).
 */
export interface Erc721AiContracts {
  erc721ai: Address;
  metering: Address;
  attestation?: Address;
}

/**
 * On-chain representation of a tokenised model asset, as returned by
 * `ERC721AI.modelAsset(tokenId)`.
 */
export interface ModelAsset {
  modelId: Hex;
  artifactHash: Hex;
  baseModel: Hex;
  weightsCID: string;
  architecture: string;
  license: string;
  inferenceEndpoint: string;
  creatorRoyaltyBps: number;
  createdAt: bigint;
  creator: Address;
}

/** Parameters for `ModelModule.mintModel`. */
export interface MintModelParams {
  to: Address;
  modelId: Hex;
  artifactHash: Hex;
  /** 0x00..0 when this is a root model (no base). */
  baseModel: Hex;
  weightsCID: string;
  architecture: string;
  license: string;
  inferenceEndpoint: string;
  /** Basis points, 0-10000. */
  creatorRoyaltyBps: number;
}

/**
 * On-chain metering record for a tokenised model, as returned by
 * `ERC721AIx402Metering.getModelInfo(tokenId)`.
 */
export interface MeteringModelInfo {
  owner: Address;
  /** Price in USDC atomic units (6 decimals). */
  pricePerInference: bigint;
  active: boolean;
  totalInferences: bigint;
}

/**
 * Attestation record, as returned by
 * `ERC721AIAttestationHook.attestationsByTokenId(tokenId)`.
 */
export interface TrainingAttestation {
  modelId: Hex;
  artifactHash: Hex;
  attestationHash: Hex;
  attestationKind: Hex;
  verifier: Address;
  verifiedAt: bigint;
}

/**
 * Common return shape for write methods — a transaction hash plus a helper
 * that resolves once the transaction is confirmed.
 */
export interface WriteResult {
  hash: Hash;
  wait: () => Promise<void>;
}
