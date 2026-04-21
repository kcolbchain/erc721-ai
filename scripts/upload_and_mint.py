#!/usr/bin/env python3
"""
Upload AI model weights to IPFS/Arweave and mint ERC-721 AI token in one flow.

Usage:
  # Upload to IPFS
  python scripts/upload_and_mint.py --weights model.onnx --name "My Model" --storage ipfs

  # Upload to Arweave  
  python scripts/upload_and_mint.py --weights model.onnx --name "My Model" --storage arweave

  # Upload to both (recommended for redundancy)
  python scripts/upload_and_mint.py --weights model.onnx --name "My Model" --storage both

  # Dry run (just generate metadata, no upload)
  python scripts/upload_and_mint.py --weights model.onnx --name "My Model" --architecture "ResNet-50" --dataset-hash abc123 --dry-run

Requires:
  - ipfs-http-client (pip install ipfshttpclient)
  - arweave-python (pip install arweave)
  - web3 (pip install web3)
"""

import argparse
import hashlib
import json
import logging
import os
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class ModelMetadata:
    """ERC-721 AI token metadata as specified in issue #4.

    tokenURI should point to JSON with:
    - model hash (SHA-256)
    - storage CID (IPFS) or txn ID (Arweave)
    - architecture description
    - training dataset hash
    """
    name: str
    description: str
    model_hash_sha256: str
    storage_cid: str  # IPFS CID or Arweave TX ID
    storage_type: str  # "ipfs" or "arweave"
    architecture: str
    training_dataset_hash: str
    version: str = "1.0.0"

    def to_token_uri_json(self) -> str:
        """Generate tokenURI JSON content."""
        return json.dumps(asdict(self), indent=2)


def compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


# ── IPFS Upload ────────────────────────────────────────────────────────────────

def upload_to_ipfs(file_path: str) -> str:
    """Upload file to IPFS and return the CID.

    Requires a running IPFS node or pinning service.
    """
    try:
        import ipfshttpclient
    except ImportError:
        logger.error("ipfshttpclient not installed. Run: pip install ipfshttpclient")
        sys.exit(1)

    logger.info(f"Uploading {file_path} to IPFS...")

    try:
        with ipfshttpclient.connect() as client:
            result = client.add(file_path)
            cid = result["Hash"]
            logger.info(f"IPFS upload complete. CID: {cid}")
            return cid
    except Exception as e:
        logger.error(f"IPFS upload failed: {e}")
        logger.info("Make sure IPFS daemon is running: ipfs daemon")
        sys.exit(1)


# ── Arweave Upload ─────────────────────────────────────────────────────────────

def upload_to_arweave(file_path: str, wallet_path: Optional[str] = None) -> str:
    """Upload file to Arweave and return the transaction ID.

    Requires an Arweave wallet (keyfile JSON).
    """
    try:
        from arweave.arweave_lib import Wallet, Transaction
    except ImportError:
        logger.error("arweave not installed. Run: pip install arweave")
        sys.exit(1)

    if not wallet_path:
        wallet_path = os.environ.get("ARWEAVE_WALLET_PATH")
    if not wallet_path:
        logger.error("Arweave wallet path required. Set ARWEAVE_WALLET_PATH or pass --wallet")
        sys.exit(1)

    logger.info(f"Uploading {file_path} to Arweave...")

    try:
        wallet = Wallet(wallet_path)
        with open(file_path, "rb") as f:
            data = f.read()

        tx = Transaction(wallet, data=data)
        tx.add_tag("Content-Type", "application/octet-stream")
        tx.add_tag("App-Name", "ERC721-AI-Weights")
        tx.sign()
        tx.send()

        logger.info(f"Arweave upload complete. TX: {tx.id}")
        return tx.id
    except Exception as e:
        logger.error(f"Arweave upload failed: {e}")
        sys.exit(1)


# ── Metadata Upload ────────────────────────────────────────────────────────────

def upload_metadata_to_ipfs(metadata: ModelMetadata) -> str:
    """Upload metadata JSON to IPFS and return CID for tokenURI."""
    try:
        import ipfshttpclient
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(metadata.to_token_uri_json())
            meta_path = f.name

        with ipfshttpclient.connect() as client:
            result = client.add(meta_path)
            cid = result["Hash"]
            os.unlink(meta_path)
            return f"ipfs://{cid}"
    except Exception as e:
        logger.warning(f"Could not upload metadata to IPFS: {e}")
        # Return data URI as fallback
        import base64
        encoded = base64.b64encode(metadata.to_token_uri_json().encode()).decode()
        return f"data:application/json;base64,{encoded}"


# ── Main Flow ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Upload AI model weights and mint ERC-721 token")
    parser.add_argument("--weights", required=True, help="Path to model weights file")
    parser.add_argument("--name", required=True, help="Model name")
    parser.add_argument("--description", default="", help="Model description")
    parser.add_argument("--architecture", required=True, help="Architecture description (e.g., 'ResNet-50, PyTorch')")
    parser.add_argument("--dataset-hash", required=True, help="SHA-256 hash of training dataset")
    parser.add_argument("--storage", choices=["ipfs", "arweave", "both"], default="ipfs",
                        help="Storage backend (default: ipfs)")
    parser.add_argument("--wallet", help="Arweave wallet keyfile path")
    parser.add_argument("--dry-run", action="store_true", help="Skip actual upload, just generate metadata")

    args = parser.parse_args()

    # Step 1: Compute model hash
    logger.info("Computing model SHA-256 hash...")
    model_hash = compute_sha256(args.weights)
    logger.info(f"Model hash: {model_hash}")

    # Step 2: Upload weights
    storage_cid = ""
    storage_type = args.storage

    if args.dry_run:
        storage_cid = "QmDRUMTQcVYUFPGn466uEtiGC8jU7bjhMiR7Y3iDSqTTNn"
        logger.info(f"[DRY RUN] Would upload to {storage_type}")
    elif args.storage in ("ipfs", "both"):
        storage_cid = upload_to_ipfs(args.weights)
        storage_type = "ipfs"
    elif args.storage == "arweave":
        storage_cid = upload_to_arweave(args.weights, args.wallet)
        storage_type = "arweave"

    if args.storage == "both" and not args.dry_run:
        # Also upload to Arweave for redundancy
        ar_tx = upload_to_arweave(args.weights, args.wallet)
        logger.info(f"Redundant copy on Arweave: {ar_tx}")

    # Step 3: Build metadata
    metadata = ModelMetadata(
        name=args.name,
        description=args.description,
        model_hash_sha256=model_hash,
        storage_cid=storage_cid,
        storage_type=storage_type,
        architecture=args.architecture,
        training_dataset_hash=args.dataset_hash,
    )

    logger.info("Generated metadata:")
    print(metadata.to_token_uri_json())

    # Step 4: Upload metadata to IPFS for tokenURI
    if not args.dry_run:
        token_uri = upload_metadata_to_ipfs(metadata)
        logger.info(f"tokenURI: {token_uri}")
    else:
        logger.info("[DRY RUN] Would upload metadata to IPFS for tokenURI")


if __name__ == "__main__":
    main()
