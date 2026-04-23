import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem';

import { Erc721AiAbi } from './abis.js';
import { MissingWalletError } from './errors.js';
import type { MintModelParams, ModelAsset, WriteResult } from './types.js';

/**
 * Wraps the `ERC721AI.sol` reference contract. Surfaces the model-asset
 * lifecycle plus the ERC-721 reads most consumers need.
 *
 * Reads go through `publicClient`; writes require `walletClient`.
 */
export class ModelModule {
  constructor(
    private readonly address: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  /** Address of the ERC721AI contract. */
  get contractAddress(): Address {
    return this.address;
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  async ownerOf(tokenId: bigint): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    })) as Address;
  }

  /**
   * The reference `ERC721AI.sol` does not expose a canonical `tokenURI` —
   * it stores a `weightsCID` on the model-asset record. Callers that need
   * an ERC-721 Metadata JSON pointer typically want the off-chain resolver
   * URI derived from that CID. This helper returns `ipfs://<weightsCID>`
   * when a CID is present; override or extend for other gateways.
   */
  async tokenURI(tokenId: bigint): Promise<string> {
    const asset = await this.modelAsset(tokenId);
    if (!asset.weightsCID) return '';
    // Preserve existing scheme if the CID is already a URI.
    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(asset.weightsCID)) {
      return asset.weightsCID;
    }
    return `ipfs://${asset.weightsCID}`;
  }

  async modelAsset(tokenId: bigint): Promise<ModelAsset> {
    const raw = (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'modelAsset',
      args: [tokenId],
    })) as readonly [
      Hex, // modelId
      Hex, // artifactHash
      Hex, // baseModel
      string, // weightsCID
      string, // architecture
      string, // license
      string, // inferenceEndpoint
      number, // creatorRoyaltyBps
      bigint, // createdAt
      Address, // creator
    ];
    return {
      modelId: raw[0],
      artifactHash: raw[1],
      baseModel: raw[2],
      weightsCID: raw[3],
      architecture: raw[4],
      license: raw[5],
      inferenceEndpoint: raw[6],
      creatorRoyaltyBps: Number(raw[7]),
      createdAt: raw[8],
      creator: raw[9],
    };
  }

  async royaltyInfo(
    tokenId: bigint,
    salePrice: bigint,
  ): Promise<{ receiver: Address; royaltyAmount: bigint }> {
    const raw = (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'royaltyInfo',
      args: [tokenId, salePrice],
    })) as readonly [Address, bigint];
    return { receiver: raw[0], royaltyAmount: raw[1] };
  }

  async tokenIdByModelId(modelId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'tokenIdByModelId',
      args: [modelId],
    })) as bigint;
  }

  async totalSupply(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'totalSupply',
    })) as bigint;
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  /**
   * Mint a new tokenised model asset.
   *
   * The caller becomes `creator` and, unless `to` differs, the initial
   * token owner. `creatorRoyaltyBps` is capped at 10_000 (100%) by the
   * contract; this method does not pre-validate it so reverts surface
   * with the contract's own error.
   */
  async mintModel(params: MintModelParams): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'mintModel',
      args: [
        params.to,
        params.modelId,
        params.artifactHash,
        params.baseModel,
        params.weightsCID,
        params.architecture,
        params.license,
        params.inferenceEndpoint,
        params.creatorRoyaltyBps,
      ],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Update the inference endpoint. Only the current token owner may call. */
  async setInferenceEndpoint(params: {
    tokenId: bigint;
    endpoint: string;
  }): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'setInferenceEndpoint',
      args: [params.tokenId, params.endpoint],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Record the attestation kind for a token. Only the original creator may call. */
  async setAttestationKind(params: {
    tokenId: bigint;
    kind: Hex;
  }): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiAbi,
      functionName: 'setAttestationKind',
      args: [params.tokenId, params.kind],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private requireWallet(): WalletClient {
    if (!this.walletClient) throw new MissingWalletError();
    return this.walletClient;
  }

  private makeWriteResult(hash: Hash): WriteResult {
    return {
      hash,
      wait: async () => {
        await this.publicClient.waitForTransactionReceipt({ hash });
      },
    };
  }
}
