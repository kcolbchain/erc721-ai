---
eip: <TBD — request from EIP editors>
title: Tokenized AI Model Weights (ERC-721 AI)
description: A token standard for representing ownership, provenance, and tradability of fine-tuned AI model weights, extending ERC-721.
author: kcolbchain (@kcolbchain), Abhishek Krishna (@abhicris), Pattermesh (@Pattermesh)
discussions-to: https://ethereum-magicians.org/<TBD>
status: Draft
type: Standards Track
category: ERC
created: 2026-05-22
requires: 165, 721, 2981
---

> **Status note (kcolbchain internal):** This file is a skeleton intended to be expanded into a formal EIP submission. The full v0 design lives in [`docs/spec-erc721-ai.md`](../docs/spec-erc721-ai.md). The job of this document is to translate that spec into the EIP-1 template so it can be submitted to `ethereum/EIPs`.
>
> Owner: **@abhicris**. See `kcolbchain/internal#<TBD>` for the working draft and discussion thread.

## Abstract

ERC-721 AI extends ERC-721 with a standardized metadata schema for tokenized AI model weights. Each token represents one model asset — identified by a content-addressed artifact hash — and exposes its weights pointer, base-model provenance, architecture, license, inference endpoint, and royalty information through a uniform on-chain interface.

## Motivation

The AI model ecosystem currently lacks portable primitives for:

1. **Ownership** — splitting rights between dataset curators, fine-tuners, and infra providers.
2. **Provenance** — recording the lineage of fine-tuned models against their parent base models.
3. **Access & monetization** — exposing a standard inference endpoint and royalty hook (ERC-2981).

ERC-721 AI keeps the asset layer inside the ERC-721 interface so model NFTs render in every existing wallet, marketplace, and indexer. Verifiable training claims (ZK / TEE) are handled by a separate, optional attestation-hook extension.

See `docs/spec-erc721-ai.md` §2 for the long-form motivation, including HuggingFace ownership limitations and the x402 per-inference metering coupling.

## Specification

> **TODO (@abhicris):** Lift §3 of `docs/spec-erc721-ai.md` into this section using the RFC 2119 keywords (MUST / SHOULD / MAY). Cover at minimum:
>
> - Required metadata fields and types (table form, as in the spec)
> - On-chain struct layout (reference)
> - Required interface (`mintModel`, `modelAsset`, `setInferenceEndpoint`, `setAttestationKind`, `tokenURI`)
> - ERC-165 interface IDs
> - ERC-2981 royalty integration
> - Events
> - Backwards compatibility statement (ERC-721 subset preserved)

## Rationale

> **TODO (@abhicris):** Why these specific fields and not others? Why on-chain struct + tokenURI JSON instead of pure tokenURI? Why optional `baseModel` rather than required provenance chain? Why decouple attestation into a hook rather than embed it?

## Backwards Compatibility

ERC-721 AI is a strict superset of ERC-721. Tokens conforming to this standard MUST also conform to ERC-721 and SHOULD conform to ERC-2981.

## Reference Implementation

See [`contracts/ERC721AI.sol`](../contracts/ERC721AI.sol) and [`test/ERC721AI.t.sol`](../test/ERC721AI.t.sol) in this repository.

## Security Considerations

> **TODO (@abhicris):** Address at minimum:
>
> - Artifact hash collision and weight tampering
> - `inferenceEndpoint` URL spoofing and rotation semantics
> - Royalty enforcement assumptions (ERC-2981 is advisory)
> - Attestation-hook trust model (out of scope here, but reference it)

## Copyright

Copyright and related rights waived via [CC0](../LICENSE).
