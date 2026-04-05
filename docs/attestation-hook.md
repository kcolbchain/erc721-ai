# Attestation Hook Extension

This repository now includes a pluggable attestation hook to support verifiable training claims.

## What was added

- `contracts/interfaces/ITrainingAttestationVerifier.sol`
  - Interface for verifier contracts.
- `contracts/mocks/MockTrainingAttestationVerifier.sol`
  - Mock verifier for local/dev usage.
- `contracts/ERC721AIAttestationHook.sol`
  - Registry-style hook that stores verified attestation metadata per token.

## Data model

Per token, the hook stores:

- `modelId`: canonical model identifier hash
- `artifactHash`: hash of training artifact / weight bundle
- `attestationHash`: `keccak256(attestationData)`
- `attestationKind`: kind discriminator (`bytes32`) such as `"ZK_PROOF"` or `"TEE_SIG"`
- `verifier`: verifier contract used
- `verifiedAt`: verification timestamp

## How to plug in a production verifier

1. Implement `ITrainingAttestationVerifier` for your attestation type.
2. Deploy the verifier contract.
3. Configure the verifier on the hook:

```solidity
hook.setAttestationVerifier(keccak256("ZK_PROOF"), verifierAddress);
```

4. Call `registerAndVerifyAttestation(...)` after mint or during metadata finalization.

## Verifier interface contract

```solidity
function verifyAttestation(
    bytes32 modelId,
    bytes32 artifactHash,
    bytes calldata attestationData
) external view returns (bool);
```

### Example verifier behaviors

- **ZK verifier**: decode proof bytes and verify against public inputs `(modelId, artifactHash)`.
- **TEE verifier**: verify enclave signature over `(modelId, artifactHash, nonce)` and signer trust root.

## Mock verifier usage

`MockTrainingAttestationVerifier` supports two modes:

- `setAcceptAll(true)` for permissive local testing.
- `setApproval(modelId, artifactHash, attestationData, true)` for digest-specific validation.

## Notes

- The hook is intentionally standalone so existing ERC-721 implementations can compose it without inheritance constraints.
- `attestationKind` is `bytes32` to keep on-chain storage cheap and avoid string comparisons.
