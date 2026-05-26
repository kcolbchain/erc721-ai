# x402 Payment Metadata Schema

## Overview

The x402 protocol enables per-inference USDC micropayments for ERC-721 AI models.
This document defines the optional `payment` field in the ERC-721 AI metadata schema.

## Schema

```json
{
  "payment": {
    "protocol": "x402/v1",
    "scheme": "exact",
    "network": "base",
    "asset": "USDC",
    "amount": "0.0005",
    "recipient": "0x..."
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protocol` | string | yes | Always `"x402/v1"` |
| `scheme` | string | yes | Payment scheme: `"exact"` (fixed price) or `"flex"` (dynamic) |
| `network` | string | yes | Target chain (e.g. `"base"`, `"arbitrum"`, `"polygon"`) |
| `asset` | string | yes | Payment asset (e.g. `"USDC"`, `"USDT"`) |
| `amount` | string | yes | Price per inference as decimal string |
| `recipient` | string | yes | Address that receives payment (model owner) |

## On-Chain Storage

The optional `ERC721AIx402PaymentManifest` contract stores payment manifests on-chain:

```solidity
function setPaymentManifest(uint256 tokenId, bytes manifest) external;
function getPaymentManifest(uint256 tokenId) external view returns (bytes memory);
```

## Inference Server Flow

1. Client requests inference at model endpoint
2. Server reads token metadata, finds `payment` field
3. Server responds with HTTP 402 + x402 payment challenge
4. Client pays USDC via `ERC721AIx402Metering.payForInference(tokenId)`
5. Client retries request with payment receipt
6. Server verifies `InferencePaid` event, runs inference, returns result

## See Also

- `contracts/ERC721AIx402Metering.sol` — on-chain payment metering
- `contracts/extensions/ERC721AIx402PaymentManifest.sol` — payment manifest storage
