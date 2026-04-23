import { describe, it, expect } from 'vitest';
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
} from 'viem';

import { createErc721AiClient } from '../src/client.js';
import { MissingAttestationError } from '../src/errors.js';
import { Erc721AiAttestationHookAbi, makeHarness } from './helpers.js';

const ERC721AI: Address = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca';
const METERING: Address = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const HOOK: Address = '0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed';

const MODEL_ID: Hex = `0x${'11'.repeat(32)}`;
const ARTIFACT_HASH: Hex = `0x${'22'.repeat(32)}`;
const ATTEST_KIND: Hex = `0x${'33'.repeat(32)}`;
const ATTEST_HASH: Hex = `0x${'44'.repeat(32)}`;
const VERIFIER: Address = '0x9999999999999999999999999999999999999999';

describe('AttestationModule', () => {
  it('throws MissingAttestationError when attestation address is omitted', () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: { erc721ai: ERC721AI, metering: METERING },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    expect(() => ai.attestation).toThrow(MissingAttestationError);
  });

  it('decodes getAttestation', async () => {
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAttestationHookAbi,
          functionName: 'attestationsByTokenId',
          result: [
            MODEL_ID,
            ARTIFACT_HASH,
            ATTEST_HASH,
            ATTEST_KIND,
            VERIFIER,
            1_700_000_000n,
          ],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: {
        erc721ai: ERC721AI,
        metering: METERING,
        attestation: HOOK,
      },
      publicClient: harness.publicClient,
    });
    const rec = await ai.attestation.getAttestation(1n);
    expect(rec.modelId).toBe(MODEL_ID);
    expect(rec.artifactHash).toBe(ARTIFACT_HASH);
    expect(rec.attestationHash).toBe(ATTEST_HASH);
    expect(rec.attestationKind).toBe(ATTEST_KIND);
    expect(rec.verifier.toLowerCase()).toBe(VERIFIER.toLowerCase());
    expect(rec.verifiedAt).toBe(1_700_000_000n);
  });

  it('verifyAttestation returns true on matching (modelId, artifactHash, kind)', async () => {
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAttestationHookAbi,
          functionName: 'attestationsByTokenId',
          result: [
            MODEL_ID,
            ARTIFACT_HASH,
            ATTEST_HASH,
            ATTEST_KIND,
            VERIFIER,
            1_700_000_000n,
          ],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: {
        erc721ai: ERC721AI,
        metering: METERING,
        attestation: HOOK,
      },
      publicClient: harness.publicClient,
    });
    const ok = await ai.attestation.verifyAttestation({
      tokenId: 1n,
      modelId: MODEL_ID,
      artifactHash: ARTIFACT_HASH,
      attestationKind: ATTEST_KIND,
    });
    expect(ok).toBe(true);
  });

  it('verifyAttestation returns false when the record is unset', async () => {
    const ZERO: Hex = `0x${'00'.repeat(32)}`;
    const ZERO_ADDR: Address = '0x0000000000000000000000000000000000000000';
    const harness = makeHarness({
      eth_call: () =>
        encodeFunctionResult({
          abi: Erc721AiAttestationHookAbi,
          functionName: 'attestationsByTokenId',
          result: [ZERO, ZERO, ZERO, ZERO, ZERO_ADDR, 0n],
        }) as Hex,
    });
    const ai = createErc721AiClient({
      contracts: {
        erc721ai: ERC721AI,
        metering: METERING,
        attestation: HOOK,
      },
      publicClient: harness.publicClient,
    });
    const ok = await ai.attestation.verifyAttestation({
      tokenId: 1n,
      modelId: MODEL_ID,
      artifactHash: ARTIFACT_HASH,
      attestationKind: ATTEST_KIND,
    });
    expect(ok).toBe(false);
  });

  it('sends registerAttestation with the full payload', async () => {
    const harness = makeHarness();
    const ai = createErc721AiClient({
      contracts: {
        erc721ai: ERC721AI,
        metering: METERING,
        attestation: HOOK,
      },
      publicClient: harness.publicClient,
      walletClient: harness.walletClient,
    });
    const data: Hex = '0xdeadbeef';
    await ai.attestation.registerAttestation({
      tokenId: 5n,
      modelId: MODEL_ID,
      artifactHash: ARTIFACT_HASH,
      attestationKind: ATTEST_KIND,
      attestationData: data,
    });
    const tx = harness.provider.sentTxs[0]!;
    expect(tx.to?.toLowerCase()).toBe(HOOK.toLowerCase());
    const decoded = decodeFunctionData({
      abi: Erc721AiAttestationHookAbi,
      data: tx.data!,
    });
    expect(decoded.functionName).toBe('registerAndVerifyAttestation');
    const args = decoded.args as readonly unknown[];
    expect(args[0]).toBe(5n);
    expect(args[1]).toBe(MODEL_ID);
    expect(args[2]).toBe(ARTIFACT_HASH);
    expect(args[3]).toBe(ATTEST_KIND);
    expect(args[4]).toBe(data);
  });
});
