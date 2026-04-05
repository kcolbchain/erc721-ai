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

## Attestation Hook (ZK / TEE)

This repo includes a pluggable contract-level attestation hook for verifiable training claims:

- `contracts/interfaces/ITrainingAttestationVerifier.sol`
- `contracts/mocks/MockTrainingAttestationVerifier.sol`
- `contracts/ERC721AIAttestationHook.sol`

Design and integration details are documented in `docs/attestation-hook.md`.

## Links

- **Docs:** https://docs.kcolbchain.com/erc721-ai/
- **All projects:** https://docs.kcolbchain.com/
- **kcolbchain:** https://kcolbchain.com

## License

MIT

---

*Founded by [Abhishek Krishna](https://abhishekkrishna.com) • GitHub: [@abhicris](https://github.com/abhicris)*
