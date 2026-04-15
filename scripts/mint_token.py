#!/usr/bin/env python3
"""
One-flow script: Upload weights to IPFS/Arweave and mint ERC721AI token.

This script combines:
1. Uploading weights to off-chain storage
2. Generating token metadata
3. Minting the token (requires contract interaction)

Usage:
    python scripts/mint_oneflow.py \
        --weights ./model.weights \
        --contract 0x1234... \
        --private-key 0xabcd... \
        --arweave

Requirements:
    pip install web3 arweave eth_account
"""

import argparse
import json
import sys
from pathlib import Path

from upload_weights import upload_and_mint


def mint_token(
    contract_address: str,
    token_uri: str,
    private_key: str,
    rpc_url: str = "http://localhost:8545"
) -> str:
    """Mint ERC721AI token with the given URI."""
    try:
        from web3 import Web3
        from eth_account import Account
    except ImportError:
        print("❌ web3 or eth_account not installed")
        print("   Run: pip install web3 eth_account")
        sys.exit(1)
    
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        print(f"❌ Cannot connect to RPC: {rpc_url}")
        sys.exit(1)
    
    account = Account.from_key(private_key)
    print(f"   Account: {account.address}")
    
    # ERC721AI contract ABI (minimal for minting)
    abi = [
        {
            "inputs": [
                {"name": "to", "type": "address"},
                {"name": "tokenURI", "type": "string"}
            ],
            "name": "mint",
            "outputs": [{"name": "tokenId", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ]
    
    contract = w3.eth.contract(address=contract_address, abi=abi)
    
    nonce = w3.eth.get_transaction_count(account.address)
    tx = contract.functions.mint(account.address, token_uri).build_transaction({
        'from': account.address,
        'nonce': nonce,
        'gas': 200000,
        'gasPrice': w3.eth.gas_price
    })
    
    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    token_id = receipt.logs[0]['topics'][3] if receipt.logs else "unknown"
    return token_id


def main():
    parser = argparse.ArgumentParser(description="Upload weights and mint ERC721AI token")
    parser.add_argument("--weights", required=True, help="Path to model weights file")
    parser.add_argument("--storage", choices=["ipfs", "arweave"], default="ipfs")
    parser.add_argument("--contract", required=True, help="ERC721AI contract address")
    parser.add_argument("--private-key", required=True, help="Wallet private key")
    parser.add_argument("--rpc-url", default="http://localhost:8545", help="RPC URL")
    parser.add_argument("--arweave-wallet", help="Arweave wallet path")
    parser.add_argument("--architecture", default="Transformer-based model")
    parser.add_argument("--dataset", help="Training dataset path")
    parser.add_argument("--model-name", help="Model name")
    parser.add_argument("--output-dir", default="./output", help="Output directory")
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    metadata_path = f"{args.output_dir}/metadata.json"
    
    print("🚀 ERC721AI One-Flow: Upload + Mint")
    print("=" * 50)
    
    print("\n📤 Step 1: Uploading weights...")
    result = upload_and_mint(
        weights_path=args.weights,
        storage=args.storage,
        architecture=args.architecture,
        dataset_path=args.dataset,
        arweave_wallet=args.arweave_wallet,
        output=metadata_path
    )
    
    print("\n⛓️  Step 2: Minting token...")
    token_id = mint_token(
        contract_address=args.contract,
        token_uri=f"ipfs://{result['storage_cid']}",
        private_key=args.private_key,
        rpc_url=args.rpc_url
    )
    
    print(f"\n✅ Token minted!")
    print(f"   Token ID: {token_id}")
    print(f"   Metadata: {metadata_path}")


if __name__ == "__main__":
    import os
    main()
