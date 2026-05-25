# ZKML Proof Metadata Schema

## Overview

ZKML (zero-knowledge machine learning) proofs enable cryptographic verification
that a specific AI model produced a specific inference output. This document defines
the optional `proof` field in the ERC-721 AI metadata schema.

## Schema

```json
{
  "proof": {
    "protocol": "giza/stark",
    "verifier_contract": "0x...",
    "proof_uri": "ipfs://..."
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protocol` | string | yes | ZK protocol identifier (e.g. `"giza/stark"`, `"risc0"`) |
| `verifier_contract` | string | yes | On-chain verifier contract address |
| `proof_uri` | string | yes | URI to serialized proof (IPFS recommended) |

## On-Chain Verification

The `ERC721AIZkVerifierStub` contract records proof submissions:

1. Model owner or inference provider submits a ZK proof
2. The stub forwards proof to the verifier contract
3. On success, the proof hash is stored against the token ID
4. Anyone can query `getVerificationRecord(proofHash)` to verify

## Integration with Giza

[Giza](https://github.com/gizatechxyz) provides a StarkNet-based ZKML pipeline:

1. Train model and transpile to Cairo
2. Deploy verifier contract (`IZkVerifier`) on-chain
3. Run inference via Giza's pipeline (ONNX -> Cairo -> proof)
4. Attach proof to ERC-721 AI metadata
5. Submit proof on-chain via `ERC721AIZkVerifierStub`

## Examples

See `examples/giza_verified_inference/` for end-to-end reference.
