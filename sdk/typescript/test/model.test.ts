import { describe, it, expect } from 'vitest';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  type Address,
  type Hex,
} from 'viem';

import { createErc721AiClient } from '../src/client.js';
import { MissingWalletError } from '../src/errors.js';
import { Erc721AiAbi, makeHarness } from './helpers.js';

const ERC721AI: Address = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca';
const METERING: Address = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

const MODEL_ID: Hex = `0x${'11'.repeat(32)}`;
const ARTIFACT_HASH: Hex = `0x${'22'.repeat(32)}`;
const BASE_MODEL: Hex = `0x${'00'.repeat(32)}`;
const ATTEST_KIND: Hex = `0x${'33'.repeat(32)}`;

describe('ModelModule — reads', () => {
  it('decodes ownerOf', async () => {
    const expected: Address = '0x1111111111111111111111111111111111111111';
    const harness = makeHarness({
      eth_call: () =>
        encodeAbiParameters([{ type: 'address' }], [expected]) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    const got = await ai.model.ownerOf(7n);
    expect(got.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('decodes modelAsset into a typed record', async () => {
    const creator: Address = '0x2222222222222222222222222222222222222222';
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAbi,
          functionName: 'modelAsset',
          result: [
            MODEL_ID,
            ARTIFACT_HASH,
            BASE_MODEL,
            'bafybeigweights',
            'llama-7b',
            'Apache-2.0',
            'https://infer.example.com',
            750,
            1_700_000_000n,
            creator,
          ],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    const asset = await ai.model.modelAsset(1n);
    expect(asset.modelId).toBe(MODEL_ID);
    expect(asset.artifactHash).toBe(ARTIFACT_HASH);
    expect(asset.weightsCID).toBe('bafybeigweights');
    expect(asset.architecture).toBe('llama-7b');
    expect(asset.license).toBe('Apache-2.0');
    expect(asset.inferenceEndpoint).toBe('https://infer.example.com');
    expect(asset.creatorRoyaltyBps).toBe(750);
    expect(asset.createdAt).toBe(1_700_000_000n);
    expect(asset.creator.toLowerCase()).toBe(creator.toLowerCase());
  });

  it('synthesises tokenURI from weightsCID as ipfs://…', async () => {
    const creator: Address = '0x2222222222222222222222222222222222222222';
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAbi,
          functionName: 'modelAsset',
          result: [
            MODEL_ID,
            ARTIFACT_HASH,
            BASE_MODEL,
            'bafybeigweights',
            'llama-7b',
            'MIT',
            '',
            0,
            0n,
            creator,
          ],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    const uri = await ai.model.tokenURI(1n);
    expect(uri).toBe('ipfs://bafybeigweights');
  });

  it('decodes royaltyInfo per ERC-2981', async () => {
    const rec: Address = '0x4444444444444444444444444444444444444444';
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAbi,
          functionName: 'royaltyInfo',
          result: [rec, 7_500n],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    const info = await ai.model.royaltyInfo(1n, 100_000n);
    expect(info.receiver.toLowerCase()).toBe(rec.toLowerCase());
    expect(info.royaltyAmount).toBe(7_500n);
  });
});

describe('ModelModule — writes', () => {
  it('rejects writes when no wallet is configured', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    await expect(
      ai.model.mintModel({
        to: '0x1111111111111111111111111111111111111111',
        modelId: MODEL_ID,
        artifactHash: ARTIFACT_HASH,
        baseModel: BASE_MODEL,
        weightsCID: 'bafy',
        architecture: 'llama-7b',
        license: 'MIT',
        inferenceEndpoint: '',
        creatorRoyaltyBps: 500,
      }),
    ).rejects.toBeInstanceOf(MissingWalletError);
  });

  it('sends mintModel with correct calldata', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    const { hash } = await ai.model.mintModel({
      to: '0x1111111111111111111111111111111111111111',
      modelId: MODEL_ID,
      artifactHash: ARTIFACT_HASH,
      baseModel: BASE_MODEL,
      weightsCID: 'bafybeigweights',
      architecture: 'llama-7b',
      license: 'Apache-2.0',
      inferenceEndpoint: 'https://infer.example.com',
      creatorRoyaltyBps: 750,
    });
    expect(hash.startsWith('0x')).toBe(true);
    expect(harness.provider.sentTxs).toHaveLength(1);
    const tx = harness.provider.sentTxs[0]!;
    expect(tx.to?.toLowerCase()).toBe(ERC721AI.toLowerCase());
    const decoded = decodeFunctionData({
      abi: Erc721AiAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('mintModel');
    const args = decoded.args as readonly unknown[];
    expect((args[0] as string).toLowerCase()).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(args[1]).toBe(MODEL_ID);
    expect(args[2]).toBe(ARTIFACT_HASH);
    expect(args[3]).toBe(BASE_MODEL);
    expect(args[4]).toBe('bafybeigweights');
    expect(args[8]).toBe(750);
  });

  it('sends setInferenceEndpoint with the endpoint string', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await ai.model.setInferenceEndpoint({
      tokenId: 9n,
      endpoint: 'https://new-endpoint.example.com/v2',
    });
    const tx = harness.provider.sentTxs[0]!;
    const decoded = decodeFunctionData({
      abi: Erc721AiAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('setInferenceEndpoint');
    expect(decoded.args?.[0]).toBe(9n);
    expect(decoded.args?.[1]).toBe('https://new-endpoint.example.com/v2');
  });

  it('sends setAttestationKind with the kind bytes32', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await ai.model.setAttestationKind({ tokenId: 3n, kind: ATTEST_KIND });
    const tx = harness.provider.sentTxs[0]!;
    const decoded = decodeFunctionData({
      abi: Erc721AiAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('setAttestationKind');
    expect(decoded.args?.[0]).toBe(3n);
    expect(decoded.args?.[1]).toBe(ATTEST_KIND);
  });
});
