# erc721-ai

> Token standard for tokenized fine-tuned AI model weights — ownership, provenance, and tradability

**kcolbchain** — open-source blockchain tools and research since 2015.

## Status

Early development. Looking for contributors! See [open issues](https://github.com/kcolbchain/erc721-ai/issues) for ways to help.

## Quick Start

```bash
git clone https://github.com/kcolbchain/erc721-ai.git
cd erc721-ai
# Setup instructions coming soon
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started. Issues tagged `good-first-issue` are great entry points.

## Draft Specification

The v0 draft of the ERC-721 AI standard is in [`docs/spec-erc721-ai.md`](docs/spec-erc721-ai.md). It defines the metadata schema (model id, weights CID, artifact hash, base-model provenance, license, inference endpoint, royalty), the required interface, and the ERC-2981 + attestation-hook integration.

## Reference Implementation

- `contracts/ERC721AI.sol` — minimal, dependency-free reference that implements the full ERC-721 AI surface (`mintModel`, `modelAsset`, `setInferenceEndpoint`, `setAttestationKind`, `royaltyInfo`) plus the ERC-721 subset needed for it to render in standard wallets.
- `test/ERC721AI.t.sol` — Foundry tests covering mint, provenance chain lookup, royalties, endpoint mutation, attestation kind mutation, transfer semantics, and revert paths.

Production deployments SHOULD substitute an audited ERC-721 base (OpenZeppelin) and inherit `ERC721AI` behavior — this reference optimizes for clarity, not bytecode size.

## Attestation Hook (ZK / TEE)

This repo also includes a pluggable contract-level attestation hook for verifiable training claims:

- `contracts/interfaces/ITrainingAttestationVerifier.sol`
- `contracts/mocks/MockTrainingAttestationVerifier.sol`
- `contracts/ERC721AIAttestationHook.sol`

Design and integration details are documented in `docs/attestation-hook.md`.

## TypeScript SDK

A viem-based TypeScript SDK for the standard lives in [`sdk/typescript/`](./sdk/typescript/) — it wraps `ERC721AI`, `ERC721AIx402Metering`, and `ERC721AIAttestationHook` behind three modules (`model`, `metering`, `attestation`) so consumers can mint a tokenised model, set an inference price, pay per call, and withdraw revenue in roughly five lines of code. See [`sdk/typescript/README.md`](./sdk/typescript/README.md) for the quickstart.

## Links

- **Docs:** https://docs.kcolbchain.com/erc721-ai/
- **All projects:** https://docs.kcolbchain.com/
- **kcolbchain:** https://kcolbchain.com

## License

MIT

---

*Founded by [Abhishek Krishna](https://abhishekkrishna.com) • GitHub: [@abhicris](https://github.com/abhicris)*
