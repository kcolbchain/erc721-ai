import type { PublicClient, WalletClient } from 'viem';

import { AttestationModule } from './attestation.js';
import { MissingAttestationError } from './errors.js';
import { MeteringModule } from './metering.js';
import { ModelModule } from './model.js';
import type { Erc721AiContracts } from './types.js';

export interface CreateErc721AiClientOptions {
  /** Contract addresses for the target deployment. */
  contracts: Erc721AiContracts;
  /** Public client for reads (required). */
  publicClient: PublicClient;
  /** Wallet client for writes (optional — read-only clients are fine). */
  walletClient?: WalletClient;
}

/**
 * Top-level SDK client. One handle per deployment/chain.
 *
 * @example
 * ```ts
 * import { createPublicClient, createWalletClient, http } from 'viem';
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { createErc721AiClient } from '@kcolbchain/erc721-ai-sdk';
 *
 * const publicClient = createPublicClient({ transport: http() });
 * const walletClient = createWalletClient({
 *   transport: http(),
 *   account: privateKeyToAccount(process.env.PK as `0x${string}`),
 * });
 *
 * const ai = createErc721AiClient({
 *   contracts: { erc721ai: '0x...', metering: '0x...' },
 *   publicClient,
 *   walletClient,
 * });
 *
 * const { hash, wait } = await ai.model.mintModel({ ... });
 * await wait();
 * ```
 */
export interface Erc721AiClient {
  contracts: Erc721AiContracts;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  model: ModelModule;
  metering: MeteringModule;
  /** Only available when `contracts.attestation` was configured. */
  attestation: AttestationModule;
}

export function createErc721AiClient(
  opts: CreateErc721AiClientOptions,
): Erc721AiClient {
  const { contracts, publicClient, walletClient } = opts;

  const model = new ModelModule(contracts.erc721ai, publicClient, walletClient);
  const metering = new MeteringModule(
    contracts.metering,
    publicClient,
    walletClient,
  );

  // Attestation is optional. We expose it via a JS getter that throws if
  // the caller tries to use it without providing an address — that way
  // consumers that don't care can ignore it entirely, but misuse still
  // surfaces a typed error instead of an opaque "undefined is not a
  // function".
  let cachedAttestation: AttestationModule | null = null;
  const makeAttestation = (): AttestationModule => {
    if (cachedAttestation) return cachedAttestation;
    if (!contracts.attestation) throw new MissingAttestationError();
    cachedAttestation = new AttestationModule(
      contracts.attestation,
      publicClient,
      walletClient,
    );
    return cachedAttestation;
  };

  const base: Omit<Erc721AiClient, 'attestation'> = {
    contracts,
    publicClient,
    model,
    metering,
    ...(walletClient !== undefined ? { walletClient } : {}),
  };

  return Object.defineProperty(base as Erc721AiClient, 'attestation', {
    enumerable: true,
    get: () => makeAttestation(),
  });
}
