# ERC-721 AI Model Marketplace

Static marketplace dApp for browsing and minting ERC-721 AI model NFTs on Base Sepolia.

## Run locally

Open `web/index.html` directly in a browser, or serve the folder with any static server:

```bash
npx serve web
```

No build step is required. The page loads `ethers` from a CDN and talks to the user's injected wallet.

## Configure

1. Switch the wallet to Base Sepolia.
2. Enter the deployed `ERC721AI` contract address.
3. Optionally enter an `ERC721AIAttestationHook` address.
4. Click `Load models`.

The browse view reads `totalSupply`, `modelAsset`, `ownerOf`, and optional attestation records. The mint form calls `mintModel` with generated `modelId` and `artifactHash` values derived from the metadata JSON.

## Deploy to Vercel

Use the `web` directory as the project root:

- Framework preset: Other
- Build command: leave empty
- Output directory: `.`

## Deploy to Netlify

Use these settings:

- Base directory: repository root
- Build command: leave empty
- Publish directory: `web`

The included root `netlify.toml` also publishes `web` and routes all paths back to `index.html`.

## Base Sepolia

The app requests chain ID `84532` and can add Base Sepolia to an injected wallet with:

- RPC: `https://sepolia.base.org`
- Explorer: `https://sepolia.basescan.org`
