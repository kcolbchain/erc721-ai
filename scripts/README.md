# Off-chain Weight Storage Integration

This directory contains scripts for uploading AI model weights to IPFS or Arweave, generating token metadata, and minting ERC721AI tokens.

## Files

- `upload_weights.py` - Upload weights and generate metadata
- `mint_token.py` - One-flow: upload + mint

## Quick Start

### Upload weights to IPFS

```bash
python scripts/upload_weights.py \
    --weights ./model.weights \
    --storage ipfs \
    --architecture "GPT-2 based model" \
    --output ./metadata.json
```

### Upload weights to Arweave

```bash
python scripts/upload_weights.py \
    --weights ./model.weights \
    --storage arweave \
    --arweave-wallet ./wallet.json \
    --output ./metadata.json
```

### One-flow: Upload and Mint

```bash
python scripts/mint_token.py \
    --weights ./model.weights \
    --storage ipfs \
    --contract 0x1234567890123456789012345678901234567890 \
    --private-key 0xabcd... \
    --architecture "BERT fine-tuned model"
```

## Requirements

```bash
pip install ipfshttpclient arweave web3 eth_account
```

## Output Format

The metadata JSON follows ERC721AI tokenURI spec:

```json
{
  "name": "AI Model a1b2c3d4",
  "description": "Tokenized AI model weights stored on IPFS",
  "properties": {
    "model_hash": "sha256:abc123...",
    "model_hash_algorithm": "SHA-256",
    "storage_cid": "QmXxx...",
    "storage_type": "IPFS",
    "architecture": "GPT-2 based model",
    "file_size_bytes": 12345678,
    "training_dataset_hash": "sha256:def456..."
  }
}
```

## Related Issue

This implementation addresses: https://github.com/kcolbchain/erc721-ai/issues/4
