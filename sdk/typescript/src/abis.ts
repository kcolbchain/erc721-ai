/**
 * Minimal ABIs for the erc721-ai core contracts.
 *
 * Hand-curated to cover the public surface the SDK exposes. Regenerate /
 * extend by compiling the Solidity sources under `contracts/` with Foundry
 * if you need the full interface.
 */

export const Erc721AiAbi = [
  // ─── Views ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenIdByModelId',
    stateMutability: 'view',
    inputs: [{ name: 'modelId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'modelAsset',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'modelId', type: 'bytes32' },
      { name: 'artifactHash', type: 'bytes32' },
      { name: 'baseModel', type: 'bytes32' },
      { name: 'weightsCID', type: 'string' },
      { name: 'architecture', type: 'string' },
      { name: 'license', type: 'string' },
      { name: 'inferenceEndpoint', type: 'string' },
      { name: 'creatorRoyaltyBps', type: 'uint16' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'creator', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'royaltyInfo',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'salePrice', type: 'uint256' },
    ],
    outputs: [
      { name: 'receiver', type: 'address' },
      { name: 'royaltyAmount', type: 'uint256' },
    ],
  },
  // The reference contract does not expose a canonical `tokenURI`. We
  // synthesise one client-side from `weightsCID` when callers ask for it —
  // see ModelModule.tokenURI — so no ABI entry is required here.
  // ─── Writes ─────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'mintModel',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'modelId', type: 'bytes32' },
      { name: 'artifactHash', type: 'bytes32' },
      { name: 'baseModel', type: 'bytes32' },
      { name: 'weightsCID', type: 'string' },
      { name: 'architecture', type: 'string' },
      { name: 'license', type: 'string' },
      { name: 'inferenceEndpoint', type: 'string' },
      { name: 'creatorRoyaltyBps', type: 'uint16' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setInferenceEndpoint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'endpoint', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setAttestationKind',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'kind', type: 'bytes32' },
    ],
    outputs: [],
  },
  // ─── Events ─────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'ModelMinted',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'modelId', type: 'bytes32', indexed: true },
      { name: 'artifactHash', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: false },
      { name: 'weightsCID', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const Erc721AiMeteringAbi = [
  // ─── Views ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'admin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'protocolFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'getInferencePrice',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'getModelInfo',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'price', type: 'uint128' },
      { name: 'active', type: 'bool' },
      { name: 'inferences', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'totalInferences',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'revenueBalance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ─── Writes ─────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'registerModel',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'pricePerInference', type: 'uint128' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setInferencePrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newPrice', type: 'uint128' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setModelActive',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'payForInference',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'payForInferences',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'count', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawRevenue',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // ─── Events ─────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'InferencePaid',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'inferenceCount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const Erc721AiAttestationHookAbi = [
  // ─── Views ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'attestationVerifiers',
    stateMutability: 'view',
    inputs: [{ name: 'attestationKind', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'attestationsByTokenId',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'modelId', type: 'bytes32' },
      { name: 'artifactHash', type: 'bytes32' },
      { name: 'attestationHash', type: 'bytes32' },
      { name: 'attestationKind', type: 'bytes32' },
      { name: 'verifier', type: 'address' },
      { name: 'verifiedAt', type: 'uint64' },
    ],
  },
  // ─── Writes ─────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'registerAndVerifyAttestation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'modelId', type: 'bytes32' },
      { name: 'artifactHash', type: 'bytes32' },
      { name: 'attestationKind', type: 'bytes32' },
      { name: 'attestationData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setAttestationVerifier',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'attestationKind', type: 'bytes32' },
      { name: 'verifier', type: 'address' },
    ],
    outputs: [],
  },
] as const;

/** Minimal ERC-20 fragment for USDC approvals in the metering example. */
export const Erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
