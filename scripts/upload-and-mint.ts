#!/usr/bin/env ts-node
/**
 * upload-and-mint.ts
 *
 * One-command flow that:
 *   1. Computes SHA-256 of the model weights file
 *   2. Uploads weights to IPFS via NFT.Storage
 *   3. (Optionally) uploads weights to Arweave via Irys
 *   4. Builds the ERC721AI metadata JSON
 *   5. Uploads metadata JSON to IPFS
 *   6. Calls mintModel() on the deployed ERC721AI contract
 *
 * Usage:
 *   npx ts-node scripts/upload-and-mint.ts \
 *     --weights model.bin \
 *     --architecture "ResNet-50" \
 *     --dataset-hash <sha256hex> \
 *     [--name "My Model"] \
 *     [--description "Fine-tuned on ImageNet"] \
 *     [--arweave]              # enable Arweave upload
 *     [--rpc-url <url>]        # override RPC
 *     [--contract <address>]   # override contract address
 */

import { createReadStream, readFileSync } from "fs";
import { createHash } from "crypto";
import { program } from "commander";
import { ethers } from "ethers";
import "dotenv/config";

// ── Types ───────────────────────────────────────────────────────────────────

interface UploadResult {
  ipfsCid: string;
  arweaveTxn: string;
  metadataCid: string;
  modelHash: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compute SHA-256 of a file (returns hex string). */
function sha256File(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/** Upload a Buffer to IPFS via the NFT.Storage HTTP API and return the CID. */
async function uploadToIPFS(
  data: Buffer,
  apiKey: string,
  filename: string
): Promise<string> {
  // NFT.Storage upload endpoint
  const res = await fetch("https://api.nft.storage/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/octet-stream",
      "X-Filename": filename,
    },
    body: data,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NFT.Storage upload failed (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  return json.value.cid as string;
}

/** Upload a Buffer to Arweave via Irys and return the transaction ID. */
async function uploadToArweave(
  data: Buffer,
  irysRpcUrl: string,
  privateKey: string
): Promise<string> {
  // Dynamic import so the dependency is only needed when --arweave is used.
  const { default: Irys } = await import("@irys/sdk");
  const irys = new Irys({
    url: irysRpcUrl,
    token: "ethereum",
    key: privateKey,
  });

  await irys.ready();

  const price = await irys.getPrice(data.length);
  console.log(`  Arweave upload cost: ${irys.utils.fromAtomic(price)} ETH`);

  const receipt = await irys.upload(data, {
    tags: [{ name: "Content-Type", value: "application/octet-stream" }],
  });

  return receipt.id;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

program
  .requiredOption("--weights <path>", "Path to model weights file")
  .requiredOption("--architecture <arch>", "Model architecture description")
  .requiredOption("--dataset-hash <hash>", "SHA-256 hex of training dataset")
  .option("--name <name>", "Human-readable model name", "AI Model")
  .option("--description <desc>", "Model description", "")
  .option("--arweave", "Also upload weights to Arweave via Irys", false)
  .option("--rpc-url <url>", "Ethereum JSON-RPC URL")
  .option("--contract <address>", "Deployed ERC721AI contract address")
  .option("--dry-run", "Skip on-chain mint (useful for testing uploads)", false);

async function main() {
  program.parse();
  const opts = program.opts();

  const weightsPath: string = opts.weights;
  const architecture: string = opts.architecture;
  const datasetHash: string = opts.datasetHash;
  const modelName: string = opts.name;
  const description: string = opts.description;
  const useArweave: boolean = opts.arweave;
  const dryRun: boolean = opts.dryRun;

  const rpcUrl =
    opts.rpcUrl || process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";
  const contractAddress =
    opts.contract || process.env.ERC721AI_CONTRACT_ADDRESS;
  const nftStorageKey = process.env.NFT_STORAGE_API_KEY;
  const irysRpcUrl =
    process.env.IRYS_RPC_URL || "https://node1.irys.xyz";
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!nftStorageKey) throw new Error("NFT_STORAGE_API_KEY not set");
  if (!dryRun && !contractAddress)
    throw new Error("ERC721AI_CONTRACT_ADDRESS not set");
  if (!dryRun && !deployerKey)
    throw new Error("DEPLOYER_PRIVATE_KEY not set");

  // 1. Hash the weights file
  console.log("⏳ Computing SHA-256 of weights file…");
  const modelHash = sha256File(weightsPath);
  console.log(`  Model hash: ${modelHash}`);

  // 2. Upload weights to IPFS
  console.log("⏳ Uploading weights to IPFS…");
  const weightsData = readFileSync(weightsPath);
  const ipfsCid = await uploadToIPFS(weightsData, nftStorageKey, "model.bin");
  console.log(`  IPFS CID: ${ipfsCid}`);

  // 3. (Optional) upload to Arweave
  let arweaveTxn = "";
  if (useArweave) {
    if (!process.env.IRYS_PRIVATE_KEY)
      throw new Error("IRYS_PRIVATE_KEY not set");
    console.log("⏳ Uploading weights to Arweave via Irys…");
    arweaveTxn = await uploadToArweave(
      weightsData,
      irysRpcUrl,
      process.env.IRYS_PRIVATE_KEY
    );
    console.log(`  Arweave txn: ${arweaveTxn}`);
  }

  // 4. Build metadata JSON
  const metadata = {
    name: modelName,
    description,
    model_hash: modelHash,
    storage_cid: ipfsCid,
    arweave_txn: arweaveTxn,
    architecture,
    training_dataset_hash: datasetHash,
  };
  console.log("⏳ Uploading metadata JSON to IPFS…");
  const metadataBuf = Buffer.from(JSON.stringify(metadata, null, 2));
  const metadataCid = await uploadToIPFS(
    metadataBuf,
    nftStorageKey,
    "metadata.json"
  );
  const metadataURI = `ipfs://${metadataCid}`;
  console.log(`  Metadata URI: ${metadataURI}`);

  if (dryRun) {
    console.log("\n🏁 Dry-run complete. Results:");
    console.log(JSON.stringify({ modelHash, ipfsCid, arweaveTxn, metadataURI }, null, 2));
    return;
  }

  // 5. Mint on-chain
  console.log("⏳ Minting token on-chain…");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(deployerKey!, provider);

  const abi = [
    "function mintModel(address to, bytes32 modelHash, string storageCid, string arweaveTxn, string architecture, bytes32 datasetHash, string metadataURI) external returns (uint256)",
  ];
  const contract = new ethers.Contract(contractAddress!, abi, signer);

  const modelHashBytes = "0x" + modelHash;
  const datasetHashBytes = "0x" + datasetHash;

  const tx = await contract.mintModel(
    signer.address,
    modelHashBytes,
    ipfsCid,
    arweaveTxn,
    architecture,
    datasetHashBytes,
    metadataURI
  );
  const receipt = await tx.wait();

  console.log(`\n✅ Minted! tx: ${receipt.hash}`);
  console.log(
    JSON.stringify(
      { modelHash, ipfsCid, arweaveTxn, metadataURI, txHash: receipt.hash },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("❌ Error:", err.message ?? err);
  process.exit(1);
});
