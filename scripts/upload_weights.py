#!/usr/bin/env python3
"""
Off-chain Weight Storage Integration for ERC721AI
Uploads model weights to IPFS or Arweave and generates token metadata.

Usage:
    python scripts/upload_weights.py --weights ./model.weights --arweave
    python scripts/upload_weights.py --weights ./model.weights --ipfs
    python scripts/upload_weights.py --weights ./model.weights --ipfs --dataset ./dataset.tar.gz

Requirements:
    pip install ipfshttpclient arweave
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

try:
    import ipfshttpclient
    HAS_IPFS = True
except ImportError:
    HAS_IPFS = False

try:
    import arweave
    HAS_ARWEAVE = True
except ImportError:
    HAS_ARWEAVE = False


def calculate_sha256(file_path: str) -> str:
    """Calculate SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def upload_to_ipfs(file_path: str, api_url: str = "/dns/localhost/tcp/5001") -> str:
    """Upload file to IPFS and return CID."""
    if not HAS_IPFS:
        raise ImportError("ipfshttpclient not installed. Run: pip install ipfshttpclient")
    
    with ipfshttpclient.connect(api_url) as client:
        result = client.add(file_path)
        return result["Hash"]


def upload_to_arweave(file_path: str, wallet_path: str = None) -> str:
    """Upload file to Arweave and return transaction ID."""
    if not HAS_ARWEAVE:
        raise ImportError("arweave not installed. Run: pip install arweave")
    
    if wallet_path and os.path.exists(wallet_path):
        with open(wallet_path) as f:
            wallet = json.load(f)
        client = arweave.Wallet.from_json(wallet)
    else:
        client = arweave.Wallet()
    
    with open(file_path, "rb") as f:
        data = f.read()
    
    tx = client.create_transaction(
        data=data,
        file_path=file_path,
        content_type="application/octet-stream"
    )
    client.send_transaction(tx)
    return tx["id"]


def generate_metadata(
    weights_path: str,
    storage_cid: str,
    storage_type: str,
    architecture: str = "unknown",
    dataset_hash: str = None,
    model_name: str = None
) -> dict:
    """Generate token metadata JSON matching ERC721AI tokenURI spec."""
    
    weights_hash = calculate_sha256(weights_path)
    file_size = os.path.getsize(weights_path)
    
    metadata = {
        "name": model_name or f"AI Model {weights_hash[:8]}",
        "description": f"Tokenized AI model weights stored on {storage_type}",
        "properties": {
            "model_hash": weights_hash,
            "model_hash_algorithm": "SHA-256",
            "storage_cid": storage_cid,
            "storage_type": storage_type,
            "architecture": architecture,
            "file_size_bytes": file_size,
        }
    }
    
    if dataset_hash:
        metadata["properties"]["training_dataset_hash"] = dataset_hash
    
    return metadata


def upload_and_mint(
    weights_path: str,
    storage: str = "ipfs",
    architecture: str = None,
    dataset_path: str = None,
    ipfs_api: str = "/dns/localhost/tcp/5001",
    arweave_wallet: str = None,
    output: str = None
) -> dict:
    """
    Main function: upload weights, generate metadata, optionally mint token.
    
    Returns dict with:
        - metadata: token metadata JSON
        - storage_cid: IPFS CID or Arweave TX ID
        - weights_hash: SHA-256 of weights file
    """
    
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights file not found: {weights_path}")
    
    print(f"📊 Calculating SHA-256 hash of {weights_path}...")
    weights_hash = calculate_sha256(weights_path)
    print(f"   Hash: {weights_hash}")
    
    print(f"☁️  Uploading to {storage}...")
    if storage == "ipfs":
        storage_cid = upload_to_ipfs(weights_path, ipfs_api)
        storage_type = "IPFS"
    elif storage == "arweave":
        storage_cid = upload_to_arweave(weights_path, arweave_wallet)
        storage_type = "Arweave"
    else:
        raise ValueError(f"Unknown storage type: {storage}")
    
    print(f"   CID/TX ID: {storage_cid}")
    
    dataset_hash = None
    if dataset_path:
        print(f"📊 Calculating dataset hash...")
        dataset_hash = calculate_sha256(dataset_path)
        print(f"   Dataset Hash: {dataset_hash}")
    
    print(f"📝 Generating metadata...")
    metadata = generate_metadata(
        weights_path=weights_path,
        storage_cid=storage_cid,
        storage_type=storage_type,
        architecture=architecture,
        dataset_hash=dataset_hash
    )
    
    print(f"   Metadata: {json.dumps(metadata, indent=2)}")
    
    metadata_bytes = json.dumps(metadata, indent=2).encode()
    metadata_hash = hashlib.sha256(metadata_bytes).hexdigest()
    print(f"   Metadata hash: {metadata_hash}")
    
    if output:
        output_path = Path(output)
        output_path.write_text(json.dumps(metadata, indent=2))
        print(f"💾 Metadata saved to: {output}")
        
        metadata_cid_path = output_path.parent / f"{output_path.stem}_metadata.json"
        if storage == "ipfs":
            with ipfshttpclient.connect(ipfs_api) as client:
                result = client.add(output_path)
                metadata_cid = result["Hash"]
            print(f"☁️  Metadata uploaded to IPFS: {metadata_cid}")
            with open(metadata_cid_path, "w") as f:
                json.dump({"metadata_cid": metadata_cid, "weights_cid": storage_cid}, f, indent=2)
            print(f"💾 CID references saved to: {metadata_cid_path}")
    
    return {
        "metadata": metadata,
        "storage_cid": storage_cid,
        "storage_type": storage_type,
        "weights_hash": weights_hash
    }


def main():
    parser = argparse.ArgumentParser(description="Upload AI model weights to IPFS/Arweave")
    parser.add_argument("--weights", required=True, help="Path to model weights file")
    parser.add_argument("--storage", choices=["ipfs", "arweave"], default="ipfs",
                        help="Storage backend (default: ipfs)")
    parser.add_argument("--arweave-wallet", help="Path to Arweave wallet JSON")
    parser.add_argument("--ipfs-api", default="/dns/localhost/tcp/5001",
                        help="IPFS API endpoint")
    parser.add_argument("--architecture", default="unknown",
                        help="Model architecture description")
    parser.add_argument("--dataset", help="Path to training dataset for hashing")
    parser.add_argument("--model-name", help="Model name for metadata")
    parser.add_argument("--output", help="Output file for metadata JSON")
    
    args = parser.parse_args()
    
    result = upload_and_mint(
        weights_path=args.weights,
        storage=args.storage,
        architecture=args.architecture,
        dataset_path=args.dataset,
        ipfs_api=args.ipfs_api,
        arweave_wallet=args.arweave_wallet,
        output=args.output
    )
    
    print("\n✅ Upload complete!")
    print(f"\n📋 Summary:")
    print(f"   Storage: {result['storage_type']}")
    print(f"   CID/TX ID: {result['storage_cid']}")
    print(f"   Weights Hash: {result['weights_hash']}")
    print(f"\n🔗 Use this CID as the storage_cid in your ERC721AI tokenURI")


if __name__ == "__main__":
    main()
