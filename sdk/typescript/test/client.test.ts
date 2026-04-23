import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';

import { createErc721AiClient } from '../src/client.js';
import { makeHarness } from './helpers.js';

const ERC721AI: Address = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca';
const METERING: Address = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const HOOK: Address = '0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed';

describe('createErc721AiClient', () => {
  it('exposes model and metering module handles with the right addresses', () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
    });
    expect(ai.model.contractAddress.toLowerCase()).toBe(
      ERC721AI.toLowerCase(),
    );
    expect(ai.metering.contractAddress.toLowerCase()).toBe(
      METERING.toLowerCase(),
    );
  });

  it('caches the attestation module across accesses', () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: {
        erc721ai: ERC721AI,
        metering: METERING,
        attestation: HOOK,
      },
      publicClient: harness.publicClient,
    });
    const a = ai.attestation;
    const b = ai.attestation;
    expect(a).toBe(b);
    expect(a.contractAddress.toLowerCase()).toBe(HOOK.toLowerCase());
  });
});
