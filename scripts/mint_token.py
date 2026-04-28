#!/usr/bin/env python3
"""
One-flow script: Upload weights to IPFS/Arweave and mint ERC721AI token.

This script combines:
1. Uploading weights to off-chain storage
2. Generating token metadata
3. Minting the token (requires contract interaction)

Usage:
    python scripts/mint_token.py \
        --weights ./model.weights \
        --contract 0x1234... \
        --private-key 0xabcd... \
        --arweave

Requirements:
    pip install requests web3 eth_account
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from web3 import Web3
    from eth_account import Account
    HAS_WEB3 = True
except ImportError:
    HAS_WEB3 = False

# Import upload function from upload_weights
sys.path.insert(0, str(Path(__file__).parent))
from upload_weights import upload_to_ipfs, upload_to_arweave, generate_metadata


ERC721AI_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "string", "name": "tokenURI", "type": "string"},
        ],
        "name": "safeMint",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


def mint_token(contract_address, token_uri, private_key, rpc_url="http://127.0.0.1:8545"):
    """Mint an ERC721AI token on-chain."""
    if not HAS_WEB3:
        print("Error: 'web3' and 'eth_account' packages required.")
        print("Install with: pip install web3 eth_account")
        sys.exit(1)

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = Account.from_key(private_key)

    contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=ERC721AI_ABI)

    tx = contract.functions.safeMint(account.address, token_uri).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 200000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    token_id = None
    for log in receipt.logs:
        if log.topics and log.topics[0].hex().startswith("0xddf252ad"):
            token_id = int(log.topics[3].hex(), 16)

    print(f"[Mint] TX: {tx_hash.hex()}, Token ID: {token_id}")
    return token_id


def main():
    parser = argparse.ArgumentParser(description="Upload weights and mint ERC721AI token")
    parser.add_argument("--weights", required=True, help="Path to weights file")
    parser.add_argument("--contract", required=True, help="ERC721AI contract address")
    parser.add_argument("--private-key", required=True, help="Deployer private key")
    parser.add_argument("--rpc-url", default="http://127.0.0.1:8545", help="RPC URL")
    parser.add_argument("--ipfs", action="store_true", help="Upload to IPFS")
    parser.add_argument("--arweave", action="store_true", help="Upload to Arweave")
    parser.add_argument("--arweave-wallet", help="Arweave wallet keyfile")
    parser.add_argument("--name", default="ERC721AI Token", help="Token name")
    parser.add_argument("--description", default="AI model weights", help="Token description")
    parser.add_argument("--metadata-host", choices=["ipfs", "arweave", "local"], default="local",
                        help="Where to host metadata JSON")

    args = parser.parse_args()

    # Step 1: Upload weights
    ipfs_cid = upload_to_ipfs(args.weights) if args.ipfs else None
    arweave_tx = upload_to_arweave(args.weights, wallet_keyfile=args.arweave_wallet) if args.arweave else None

    # Step 2: Generate metadata
    metadata = generate_metadata(
        name=args.name,
        description=args.description,
        ipfs_cid=ipfs_cid,
        arweave_tx=arweave_tx,
    )

    # Step 3: Upload metadata and get tokenURI
    metadata_str = json.dumps(metadata)

    if args.metadata_host == "ipfs" and ipfs_cid:
        import requests
        url = "http://127.0.0.1:5001/api/v0/add"
        r = requests.post(url, files={"file": ("metadata.json", metadata_str)}, timeout=60)
        meta_cid = r.json()["Hash"]
        token_uri = f"ipfs://{meta_cid}"
    elif args.metadata_host == "arweave" and arweave_tx:
        token_uri = f"ar://{arweave_tx}"
    else:
        token_uri = f"data:application/json;base64," + __import__("base64").b64encode(metadata_str.encode()).decode()

    # Step 4: Mint token
    token_id = mint_token(args.contract, token_uri, args.private_key, args.rpc_url)
    print(f"\n✅ Token minted! ID: {token_id}, URI: {token_uri[:80]}...")


if __name__ == "__main__":
    main()
