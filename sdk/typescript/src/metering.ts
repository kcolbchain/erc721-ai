import type { Address, Hash, PublicClient, WalletClient } from 'viem';

import { Erc721AiMeteringAbi } from './abis.js';
import {
  InvalidPriceError,
  MissingWalletError,
  ModelNotFoundError,
} from './errors.js';
import type { MeteringModelInfo, WriteResult } from './types.js';

/**
 * Wraps `ERC721AIx402Metering.sol` — per-inference USDC payment rails for
 * tokenised AI models.
 *
 * The x402 flow expected by consumers:
 *   1. Model owner calls `registerModel` (or any future equivalent that
 *      seeds a `ModelConfig`), then `setInferencePrice` to adjust.
 *   2. Caller approves USDC to the metering contract.
 *   3. Caller invokes `payForInference(tokenId)` — `InferencePaid` is
 *      emitted and the off-chain inference server watches for it before
 *      serving the HTTP 402-gated response.
 *   4. Model owner calls `withdrawRevenue()` to collect their share.
 *
 * USDC amounts are `uint128` atomic units (6 decimals).
 */
export class MeteringModule {
  constructor(
    private readonly address: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  /** Address of the ERC721AIx402Metering contract. */
  get contractAddress(): Address {
    return this.address;
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  /** USDC address this metering contract accepts. */
  async usdc(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'usdc',
    })) as Address;
  }

  /** Returns the raw USDC atomic-unit price (6 decimals). */
  async getInferencePrice(tokenId: bigint): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'getInferencePrice',
      args: [tokenId],
    })) as bigint;
  }

  async getModelInfo(tokenId: bigint): Promise<MeteringModelInfo> {
    const raw = (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'getModelInfo',
      args: [tokenId],
    })) as readonly [Address, bigint, boolean, bigint];
    const owner = raw[0];
    if (owner === '0x0000000000000000000000000000000000000000') {
      throw new ModelNotFoundError(tokenId);
    }
    return {
      owner,
      pricePerInference: raw[1],
      active: raw[2],
      totalInferences: raw[3],
    };
  }

  async totalInferences(tokenId: bigint): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'totalInferences',
      args: [tokenId],
    })) as bigint;
  }

  async revenueBalance(owner: Address): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'revenueBalance',
      args: [owner],
    })) as bigint;
  }

  async protocolFeeBps(): Promise<number> {
    const raw = (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'protocolFeeBps',
    })) as number;
    return Number(raw);
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  /**
   * Register a model for metering, seeding its initial price. The caller
   * becomes the revenue recipient (per the contract's `msg.sender`-based
   * ownership model).
   */
  async registerModel(params: {
    tokenId: bigint;
    pricePerInference: bigint;
  }): Promise<WriteResult> {
    this.assertPositivePrice(params.pricePerInference);
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'registerModel',
      args: [params.tokenId, params.pricePerInference],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Update the per-inference price. Only the registered model owner may call. */
  async setInferencePrice(params: {
    tokenId: bigint;
    newPrice: bigint;
  }): Promise<WriteResult> {
    this.assertPositivePrice(params.newPrice);
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'setInferencePrice',
      args: [params.tokenId, params.newPrice],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Pay for a single inference. Caller must have approved USDC first. */
  async payForInference(tokenId: bigint): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'payForInference',
      args: [tokenId],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Pay for N inferences at once. */
  async payForInferences(params: {
    tokenId: bigint;
    count: bigint;
  }): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'payForInferences',
      args: [params.tokenId, params.count],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  /** Withdraw accumulated USDC revenue to the caller. */
  async withdrawRevenue(): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiMeteringAbi,
      functionName: 'withdrawRevenue',
      args: [],
      account,
      chain: wallet.chain ?? null,
    });
    return this.makeWriteResult(hash);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private assertPositivePrice(price: bigint): void {
    if (price <= 0n) throw new InvalidPriceError(price);
    // uint128 upper bound.
    if (price >= 1n << 128n) throw new InvalidPriceError(price);
  }

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
