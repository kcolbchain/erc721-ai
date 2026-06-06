# erc721-ai

> Token standard for tokenized fine-tuned AI model weights — ownership, provenance, and tradability

[![CI](https://github.com/kcolbchain/erc721-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/kcolbchain/erc721-ai/actions/workflows/ci.yml)

**kcolbchain** — open-source blockchain tools and research since 2015.

## Status

Early development. Looking for contributors! See [open issues](https://github.com/kcolbchain/erc721-ai/issues) for ways to help.

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) >= 18 (for the TypeScript SDK)

### Solidity Contracts

```bash
git clone https://github.com/kcolbchain/erc721-ai.git
cd erc721-ai

# Install dependencies
forge install

# Build contracts
forge build

# Run Solidity tests
forge test
```

If you don't have Foundry installed:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### TypeScript SDK

```bash
cd sdk/typescript

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Project Structure

```
erc721-ai/
├── contracts/          # Solidity smart contracts
├── test/               # Foundry tests
├── sdk/typescript/     # TypeScript SDK
├── docs/               # Specification & documentation
├── scripts/            # Deployment & utility scripts
├── web/                # Web frontend
└── .github/workflows/  # CI/CD pipelines
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started. Issues tagged `good-first-issue` are great entry points.

## Draft Specification

The v0 draft of the ERC-721 AI standard is in [`docs/spec-erc721-ai.md`](docs/spec-erc721-ai.md). It defines the metadata schema (model id, weights CID, artifact hash, base-model provenance, license, inference endpoint, royalty), the required interface, and the ERC-2981 + attestation-hook integration.

## Reference Implementation

- `contracts/ERC721AI.sol` — minimal, dependency-free reference that implements the full ERC-721 AI surface (`mintModel`, `modelAsset`, `setInferenceEndpoint`, `setAttestationKind`, `royaltyInfo`) plus the ERC-721 subset needed for it to render in standard wallets.
- `test/ERC721AI.t.sol` — Foundry tests covering mint, provenance chain lookup, royalties, endpoint mutation, attestation kind mutation, transfer semantics, and revert paths.

Production deployments SHOULD substitute an audited ERC-721 base (OpenZeppelin) and inherit `ERC721AI`
