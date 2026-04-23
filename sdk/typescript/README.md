# @kcolbchain/erc721-ai-sdk

TypeScript SDK for the [erc721-ai](https://github.com/kcolbchain/erc721-ai)
standard — tokenised fine-tuned AI model weights with ERC-2981 royalties,
x402-style per-inference USDC metering, and a pluggable training
attestation hook.

The SDK is a thin [viem](https://viem.sh)-based wrapper: reads go through
`publicClient`, writes through `walletClient`, and the full surface is
usable in about five lines of code.

## Install

```bash
npm install @kcolbchain/erc721-ai-sdk viem
```

Requires Node 18+. Exports are dual ESM + CJS with `.d.ts` shipped.

## Quickstart

```ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createErc721AiClient } from '@kcolbchain/erc721-ai-sdk';

const publicClient = createPublicClient({ transport: http(process.env.RPC_URL!) });
const walletClient = createWalletClient({
  account: privateKeyToAccount(process.env.PK as `0x${string}`),
  transport: http(process.env.RPC_URL!),
});

const ai = createErc721AiClient({
  contracts: {
    erc721ai: '0x...',   // ERC721AI model-asset NFT
    metering: '0x...',   // ERC721AIx402Metering (USDC per-inference)
    attestation: '0x...' // optional — ERC721AIAttestationHook
  },
  publicClient,
  walletClient,
});
```

From here you have three modules:

### `ai.model` — `ModelModule`

Wraps `ERC721AI.sol`. Reads: `ownerOf`, `tokenURI`, `modelAsset`,
`royaltyInfo`, `tokenIdByModelId`, `totalSupply`. Writes: `mintModel`,
`setInferenceEndpoint`, `setAttestationKind`.

```ts
const { hash, wait } = await ai.model.mintModel({
  to: '0x...',
  modelId: '0x...',         // bytes32 — unique per model
  artifactHash: '0x...',    // bytes32 — weights blob hash
  baseModel: '0x00...',     // bytes32 — 0x0 for root models
  weightsCID: 'bafy...',
  architecture: 'llama-7b',
  license: 'Apache-2.0',
  inferenceEndpoint: 'https://infer.example.com/v1/completions',
  creatorRoyaltyBps: 500,   // 5%
});
await wait();
```

`tokenURI(tokenId)` is synthesised client-side from the on-chain
`weightsCID` as `ipfs://<cid>` (the reference contract does not store a
separate metadata URI).

### `ai.metering` — `MeteringModule`

Wraps `ERC721AIx402Metering.sol`. Reads: `getInferencePrice`,
`getModelInfo`, `totalInferences`, `revenueBalance`, `usdc`,
`protocolFeeBps`. Writes: `registerModel`, `setInferencePrice`,
`payForInference`, `payForInferences`, `setModelActive`,
`withdrawRevenue`.

Prices are `uint128` atomic units of USDC (6 decimals — `100_000n` is
$0.10).

```ts
await (await ai.metering.registerModel({ tokenId: 1n, pricePerInference: 100_000n })).wait();
await (await ai.metering.setInferencePrice({ tokenId: 1n, newPrice: 50_000n })).wait();
const price = await ai.metering.getInferencePrice(1n);
await (await ai.metering.payForInference(1n)).wait(); // consumer flow
await (await ai.metering.withdrawRevenue()).wait();   // owner flow
```

### `ai.attestation` — `AttestationModule` *(optional)*

Wraps `ERC721AIAttestationHook.sol`. Only accessible when
`contracts.attestation` is configured — otherwise reading `ai.attestation`
throws `MissingAttestationError`.

```ts
await (await ai.attestation.registerAttestation({
  tokenId: 1n,
  modelId: '0x...',
  artifactHash: '0x...',
  attestationKind: '0x...',    // e.g. keccak256("tee:intel-sgx")
  attestationData: '0x...',    // passed to the configured verifier
})).wait();

const ok = await ai.attestation.verifyAttestation({
  tokenId: 1n,
  modelId: '0x...',
  artifactHash: '0x...',
  attestationKind: '0x...',
});
```

`verifyAttestation` does a lightweight on-chain record comparison; it does
not re-run the cryptographic verifier. For re-verification, invoke the
underlying proof system off-chain with the original `attestationData`.

## x402 integration

The metering contract is designed to sit behind an HTTP 402 gate: an
inference server receives a request, responds with `402 Payment Required`
and a price, the consumer calls `ai.metering.payForInference(tokenId)` to
produce an on-chain `InferencePaid` event, and the server watches for that
event before serving the inference.

This SDK does not bundle the HTTP side — it only provides the on-chain
rails. A minimal consumer pseudocode:

```ts
// Server responds 402 with { tokenId, price, meteringAddress }.
const { tokenId, price } = JSON.parse(res.headers.get('x402-challenge')!);

// 1. Approve USDC once (or for the required amount).
await usdc.approve(meteringAddress, price);

// 2. Pay.
const { hash, wait } = await ai.metering.payForInference(BigInt(tokenId));
await wait();

// 3. Retry the request with the tx hash as proof.
await fetch(inferenceUrl, { headers: { 'x402-payment': hash } });
```

## Errors

All SDK errors extend `Erc721AiSdkError`:

- `MissingWalletError` — a write method was called without a
  `walletClient`.
- `InvalidPriceError` — `setInferencePrice` / `registerModel` was given a
  non-positive or out-of-uint128 price.
- `ModelNotFoundError` — `getModelInfo` returned the zero owner, i.e. the
  tokenId has never been registered for metering.
- `MissingAttestationError` — `ai.attestation` was accessed without
  `contracts.attestation`.

## Development

```bash
cd sdk/typescript
npm install
npm run typecheck
npm test
npm run build       # emits dist/index.mjs + dist/index.cjs + dist/*.d.ts
```

Tests use an in-memory EIP-1193 mock transport — no live chain is
required. See `test/helpers.ts`.

## License

MIT
