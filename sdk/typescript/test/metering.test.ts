import { describe, it, expect } from 'vitest';
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
} from 'viem';

import { createErc721AiClient } from '../src/client.js';
import {
  InvalidPriceError,
  ModelNotFoundError,
} from '../src/errors.js';
import { Erc721AiMeteringAbi, makeHarness } from './helpers.js';

const ERC721AI: Address = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca';
const METERING: Address = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('MeteringModule — reads', () => {
  it('decodes getInferencePrice', async () => {
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiMeteringAbi,
          functionName: 'getInferencePrice',
          result: 100_000n, // 0.10 USDC
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    expect(await ai.metering.getInferencePrice(1n)).toBe(100_000n);
  });

  it('decodes getModelInfo into a typed record', async () => {
    const owner: Address = '0x7777777777777777777777777777777777777777';
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiMeteringAbi,
          functionName: 'getModelInfo',
          result: [owner, 50_000n, true, 42n],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    const info = await ai.metering.getModelInfo(1n);
    expect(info.owner.toLowerCase()).toBe(owner.toLowerCase());
    expect(info.pricePerInference).toBe(50_000n);
    expect(info.active).toBe(true);
    expect(info.totalInferences).toBe(42n);
  });

  it('throws ModelNotFoundError when getModelInfo returns the zero owner', async () => {
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiMeteringAbi,
          functionName: 'getModelInfo',
          result: [
            '0x0000000000000000000000000000000000000000',
            0n,
            false,
            0n,
          ],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    await expect(ai.metering.getModelInfo(99n)).rejects.toBeInstanceOf(
      ModelNotFoundError,
    );
  });

  it('decodes totalInferences and revenueBalance', async () => {
    const owner: Address = '0x7777777777777777777777777777777777777777';
    const harness1 = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiMeteringAbi,
          functionName: 'totalInferences',
          result: 7n,
        }) as Hex,
    });
    const ai1 = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness1.publicClient,
    });
    expect(await ai1.metering.totalInferences(1n)).toBe(7n);

    const harness2 = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiMeteringAbi,
          functionName: 'revenueBalance',
          result: 1_234_567n,
        }) as Hex,
    });
    const ai2 = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness2.publicClient,
    });
    expect(await ai2.metering.revenueBalance(owner)).toBe(1_234_567n);
  });
});

describe('MeteringModule — writes', () => {
  it('rejects a zero inference price', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await expect(
      ai.metering.setInferencePrice({ tokenId: 1n, newPrice: 0n }),
    ).rejects.toBeInstanceOf(InvalidPriceError);
  });

  it('rejects a negative inference price', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await expect(
      ai.metering.registerModel({ tokenId: 1n, pricePerInference: -1n }),
    ).rejects.toBeInstanceOf(InvalidPriceError);
  });

  it('sends setInferencePrice with the uint128 price', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await ai.metering.setInferencePrice({ tokenId: 1n, newPrice: 50_000n });
    const tx = harness.provider.sentTxs[0]!;
    expect(tx.to?.toLowerCase()).toBe(METERING.toLowerCase());
    const decoded = decodeFunctionData({
      abi: Erc721AiMeteringAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('setInferencePrice');
    expect(decoded.args?.[0]).toBe(1n);
    expect(decoded.args?.[1]).toBe(50_000n);
  });

  it('sends payForInference against the metering address', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await ai.metering.payForInference(7n);
    const tx = harness.provider.sentTxs[0]!;
    expect(tx.to?.toLowerCase()).toBe(METERING.toLowerCase());
    const decoded = decodeFunctionData({
      abi: Erc721AiMeteringAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('payForInference');
    expect(decoded.args?.[0]).toBe(7n);
  });

  it('sends withdrawRevenue with no args', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    await ai.metering.withdrawRevenue();
    const tx = harness.provider.sentTxs[0]!;
    const decoded = decodeFunctionData({
      abi: Erc721AiMeteringAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('withdrawRevenue');
    expect(decoded.args ?? []).toEqual([]);
  });
});
