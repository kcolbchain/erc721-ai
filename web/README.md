# ERC-721 AI marketplace demo

This directory contains a static marketplace dApp for the ERC-721 AI standard.
It is intentionally dependency-light so it can be deployed on any static host.

## Features

- Connect an injected wallet with ethers.js.
- Switch to Base Sepolia.
- Paste a deployed `ERC721AI` address and load minted model NFTs from
  `totalSupply`, `modelAsset`, and `ownerOf`.
- Browse minted AI model NFTs with model ID, weights CID, base model, license,
  inference endpoint, x402 price, owner, and attestation status.
- Inspect a model detail page with provenance events and metadata JSON.
- Import an existing metadata JSON file to pre-fill the mint form.
- Mint a new model through the existing `ERC721AI.mintModel` contract surface
  when `CONTRACT_ADDRESS` is configured.
- Fall back to local preview mints when no contract address is set, so reviewers
  can test the full UI without a live deployment.

## Configure a live contract

Paste a deployed contract address into the "ERC721AI contract address" field in
the app. If you want the app to pre-fill a known deployment, open `index.html`
and set:

```js
const DEFAULT_CONTRACT_ADDRESS = "0xYourBaseSepoliaERC721AI";
```

The app targets Base Sepolia (`84532`) and calls:

```solidity
mintModel(
  address to,
  bytes32 modelId,
  bytes32 artifactHash,
  bytes32 baseModel,
  string weightsCID,
  string architecture,
  string license,
  string inferenceEndpoint,
  uint16 creatorRoyaltyBps
)
```

## Local preview

```bash
cd web
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to Vercel

1. Create a new Vercel project from the repository.
2. Set the project root directory to `web`.
3. Use no build command.
4. Set the output directory to `.`.
5. Deploy.

## Deploy to Netlify

1. Create a new Netlify site from the repository.
2. Set the base directory to `web`.
3. Leave the build command empty.
4. Set the publish directory to `web` or `.` if the base directory is already
   `web`.
5. Deploy.
