/**
 * SDK error hierarchy. Prefer these over raw throws so callers can catch by
 * type without string-matching.
 */

export class Erc721AiSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Erc721AiSdkError';
  }
}

export class MissingWalletError extends Erc721AiSdkError {
  constructor() {
    super(
      'This operation requires a wallet client. Pass `walletClient` to createErc721AiClient.',
    );
    this.name = 'MissingWalletError';
  }
}

export class InvalidPriceError extends Erc721AiSdkError {
  constructor(price: bigint | number) {
    super(
      `Inference price must be a positive integer of USDC atomic units (6 decimals); got ${String(
        price,
      )}.`,
    );
    this.name = 'InvalidPriceError';
  }
}

export class ModelNotFoundError extends Erc721AiSdkError {
  constructor(tokenId: bigint) {
    super(`No model registered for tokenId ${tokenId.toString()}.`);
    this.name = 'ModelNotFoundError';
  }
}

export class MissingAttestationError extends Erc721AiSdkError {
  constructor() {
    super(
      'No attestation hook address configured. Pass `contracts.attestation` to createErc721AiClient() to use attestation methods.',
    );
    this.name = 'MissingAttestationError';
  }
}
