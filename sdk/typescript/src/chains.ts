import { defineChain } from 'viem';

/**
 * erc721-ai devnet placeholder. The SDK is chain-agnostic; pick any chain
 * your viem clients target. This definition is primarily used by the test
 * harness so that mocked EIP-1193 transports can reply with a consistent
 * `eth_chainId`.
 */
export const erc721AiDevnet = defineChain({
  id: 1339,
  name: 'erc721-ai Devnet',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout (local)', url: 'http://127.0.0.1:4000' },
  },
  testnet: true,
});
