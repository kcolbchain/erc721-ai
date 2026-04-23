/**
 * End-to-end example: mint a model, set an inference price, simulate a
 * consumer paying for one inference, and withdraw the accumulated revenue.
 *
 * This file is written as a runnable script but will not work against a
 * real chain without valid RPC + funded key + deployed contracts; it is
 * primarily a README-level walkthrough of the SDK surface.
 *
 *   npx tsx examples/mint-and-meter.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { createErc721AiClient, Erc20Abi } from '../src/index.js';

async function main() {
  const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
  const pk = (process.env.PK ?? '0x' + '11'.repeat(32)) as Hex;

  const erc721aiAddress = (process.env.ERC721AI_ADDRESS ??
    '0x0000000000000000000000000000000000000001') as Address;
  const meteringAddress = (process.env.METERING_ADDRESS ??
    '0x0000000000000000000000000000000000000002') as Address;
  const usdcAddress = (process.env.USDC_ADDRESS ??
    '0x0000000000000000000000000000000000000003') as Address;

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  // --- 5-line quickstart ----------------------------------------------
  const ai = createErc721AiClient({
    contracts: { erc721ai: erc721aiAddress, metering: meteringAddress },
    publicClient,
    walletClient,
  });
  // --------------------------------------------------------------------

  // 1. Mint the tokenised model.
  const modelId = keccak256(stringToBytes('example-llama-7b-finetune-v1'));
  const artifactHash = keccak256(stringToBytes('weights-blob-sha256-...'));
  const baseModel = ('0x' + '00'.repeat(32)) as Hex; // root model

  const mint = await ai.model.mintModel({
    to: account.address,
    modelId,
    artifactHash,
    baseModel,
    weightsCID: 'bafybeigweightsCIDplaceholder',
    architecture: 'llama-7b',
    license: 'Apache-2.0',
    inferenceEndpoint: 'https://infer.example.com/v1/completions',
    creatorRoyaltyBps: 500,
  });
  await mint.wait();
  console.log('minted; tx:', mint.hash);

  // Find the token id the reference contract just assigned.
  const tokenId = await ai.model.tokenIdByModelId(modelId);
  console.log('tokenId:', tokenId.toString());

  // 2. Register the model with the metering contract and set the price.
  const price = 100_000n; // 0.10 USDC (6-decimal atomic units)
  await (await ai.metering.registerModel({ tokenId, pricePerInference: price })).wait();
  console.log('metering registered at price (USDC atomic):', price.toString());

  // 3. Consumer path: approve USDC, then pay. Here we reuse the same
  //    wallet for brevity; a real consumer would be a different account.
  const approveTx = await walletClient.writeContract({
    address: usdcAddress,
    abi: Erc20Abi,
    functionName: 'approve',
    args: [meteringAddress, price],
    account,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const pay = await ai.metering.payForInference(tokenId);
  await pay.wait();
  console.log('paid for one inference; tx:', pay.hash);

  // 4. Model owner withdraws the accumulated revenue.
  const bal = await ai.metering.revenueBalance(account.address);
  console.log('pending revenue (USDC atomic):', bal.toString());
  const wdr = await ai.metering.withdrawRevenue();
  await wdr.wait();
  console.log('withdrew; tx:', wdr.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
