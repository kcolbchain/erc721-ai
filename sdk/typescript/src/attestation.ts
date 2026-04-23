import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem';

import { Erc721AiAttestationHookAbi } from './abis.js';
import { MissingWalletError } from './errors.js';
import type { TrainingAttestation, WriteResult } from './types.js';

/**
 * Thin wrapper around `ERC721AIAttestationHook.sol`.
 *
 * The on-chain contract requires a pre-configured verifier for each
 * `attestationKind`. `registerAttestation` invokes the verifier and
 * records the canonical attestation if it passes; `verifyAttestation` is a
 * read-side helper that tells callers whether the attestation currently
 * stored for a tokenId matches a claimed `(modelId, artifactHash, kind)`.
 */
export class AttestationModule {
  constructor(
    private readonly address: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  /** Address of the ERC721AIAttestationHook contract. */
  get contractAddress(): Address {
    return this.address;
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  async getAttestation(tokenId: bigint): Promise<TrainingAttestation> {
    const raw = (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAttestationHookAbi,
      functionName: 'attestationsByTokenId',
      args: [tokenId],
    })) as readonly [Hex, Hex, Hex, Hex, Address, bigint];
    return {
      modelId: raw[0],
      artifactHash: raw[1],
      attestationHash: raw[2],
      attestationKind: raw[3],
      verifier: raw[4],
      verifiedAt: raw[5],
    };
  }

  /**
   * Lightweight client-side check — loads the on-chain record for
   * `tokenId` and compares it to the expected values. Returns `true` when
   * the stored attestation's `modelId`, `artifactHash`, and
   * `attestationKind` all match. This does NOT re-run the verifier; for
   * cryptographic re-verification call the off-chain proof system
   * directly with `attestationData`.
   */
  async verifyAttestation(params: {
    tokenId: bigint;
    modelId: Hex;
    artifactHash: Hex;
    attestationKind: Hex;
  }): Promise<boolean> {
    const rec = await this.getAttestation(params.tokenId);
    // An unset record has verifiedAt == 0 and verifier == zero address.
    if (rec.verifiedAt === 0n) return false;
    return (
      rec.modelId.toLowerCase() === params.modelId.toLowerCase() &&
      rec.artifactHash.toLowerCase() === params.artifactHash.toLowerCase() &&
      rec.attestationKind.toLowerCase() ===
        params.attestationKind.toLowerCase()
    );
  }

  async attestationVerifier(attestationKind: Hex): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: Erc721AiAttestationHookAbi,
      functionName: 'attestationVerifiers',
      args: [attestationKind],
    })) as Address;
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  /**
   * Register and verify a training attestation for a token. The contract
   * will revert if no verifier is configured for `attestationKind` or if
   * the verifier rejects the `attestationData` payload.
   */
  async registerAttestation(params: {
    tokenId: bigint;
    modelId: Hex;
    artifactHash: Hex;
    attestationKind: Hex;
    attestationData: Hex;
  }): Promise<WriteResult> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new MissingWalletError();

    const hash = await wallet.writeContract({
      address: this.address,
      abi: Erc721AiAttestationHookAbi,
      functionName: 'registerAndVerifyAttestation',
      args: [
        params.tokenId,
        params.modelId,
        params.artifactHash,
        params.attestationKind,
        params.attestationData,
      ],
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
