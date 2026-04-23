import {
  createPublicClient,
  createWalletClient,
  custom,
  parseTransaction,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { erc721AiDevnet } from '../src/chains.js';
import {
  Erc721AiAbi,
  Erc721AiAttestationHookAbi,
  Erc721AiMeteringAbi,
} from '../src/abis.js';

/**
 * Minimal in-memory EIP-1193 provider for unit tests. Records every call
 * so tests can assert on `eth_sendTransaction` / `eth_sendRawTransaction`
 * args and return canned values for reads.
 *
 * This is raw-tx aware: viem WalletClients backed by a private-key account
 * sign locally and broadcast via `eth_sendRawTransaction`, which we parse
 * and record in `sentTxs` so assertions can look at the decoded calldata.
 */
export interface MockCall {
  method: string;
  params: unknown[];
}

export interface MockProviderHandlers {
  eth_call?: (args: { to: Address; data: Hex }) => Hex;
  eth_getTransactionReceipt?: (hash: Hex) => unknown;
}

type AnyRequest = (args: { method: string; params?: unknown }) => Promise<unknown>;

export function createMockProvider(handlers: MockProviderHandlers = {}): {
  request: AnyRequest;
  calls: MockCall[];
  sentTxs: Array<{ to: Address; data?: Hex; value?: Hex }>;
  setNextTxHash: (h: Hex) => void;
} {
  const calls: MockCall[] = [];
  const sentTxs: Array<{ to: Address; data?: Hex; value?: Hex }> = [];
  let nextTxHash: Hex =
    '0x0000000000000000000000000000000000000000000000000000000000000001';

  const request: AnyRequest = async ({ method, params }) => {
    calls.push({ method, params: (params ?? []) as unknown[] });

    switch (method) {
      case 'eth_chainId':
        return ('0x' + erc721AiDevnet.id.toString(16)) as Hex;
      case 'eth_blockNumber':
        return '0x1' as Hex;
      case 'eth_gasPrice':
        return '0x3b9aca00' as Hex;
      case 'eth_maxPriorityFeePerGas':
        return '0x3b9aca00' as Hex;
      case 'eth_estimateGas':
        return '0x5208' as Hex;
      case 'eth_getBlockByNumber':
        return {
          number: '0x1',
          hash: '0x' + 'aa'.repeat(32),
          parentHash: '0x' + 'bb'.repeat(32),
          timestamp: '0x0',
          baseFeePerGas: '0x3b9aca00',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          miner: '0x' + '00'.repeat(20),
          extraData: '0x',
          transactions: [],
          transactionsRoot: '0x' + '00'.repeat(32),
          stateRoot: '0x' + '00'.repeat(32),
          receiptsRoot: '0x' + '00'.repeat(32),
          logsBloom: '0x' + '00'.repeat(256),
          difficulty: '0x0',
          totalDifficulty: '0x0',
          size: '0x0',
          nonce: '0x0000000000000000',
          mixHash: '0x' + '00'.repeat(32),
          sha3Uncles: '0x' + '00'.repeat(32),
          uncles: [],
        };
      case 'eth_getTransactionCount':
        return '0x0' as Hex;
      case 'eth_call': {
        const [callObj] = (params ?? []) as [
          { to: Address; data: Hex } | undefined,
        ];
        if (!callObj) throw new Error('eth_call: missing params');
        if (handlers.eth_call) return handlers.eth_call(callObj);
        // default: return empty 32-byte payload
        return '0x' + '00'.repeat(32);
      }
      case 'eth_sendRawTransaction': {
        const [raw] = (params ?? []) as [Hex];
        try {
          const parsed = parseTransaction(raw);
          const rec: { to: Address; data?: Hex; value?: Hex } = {
            to: (parsed.to ?? ('0x' + '00'.repeat(20))) as Address,
          };
          if (parsed.data !== undefined) rec.data = parsed.data as Hex;
          rec.value =
            parsed.value !== undefined
              ? (('0x' + parsed.value.toString(16)) as Hex)
              : ('0x0' as Hex);
          sentTxs.push(rec);
        } catch {
          // best-effort
        }
        return nextTxHash;
      }
      case 'eth_sendTransaction': {
        const [txObj] = (params ?? []) as [
          { to: Address; data?: Hex; value?: Hex } | undefined,
        ];
        if (txObj) sentTxs.push(txObj);
        return nextTxHash;
      }
      case 'eth_getTransactionReceipt': {
        const [hash] = (params ?? []) as [Hex];
        if (handlers.eth_getTransactionReceipt) {
          return handlers.eth_getTransactionReceipt(hash);
        }
        return {
          blockHash: '0x' + 'cc'.repeat(32),
          blockNumber: '0x1',
          contractAddress: null,
          cumulativeGasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00',
          from: '0x' + '11'.repeat(20),
          gasUsed: '0x5208',
          logs: [],
          logsBloom: '0x' + '00'.repeat(256),
          status: '0x1',
          to: '0x' + '22'.repeat(20),
          transactionHash: hash,
          transactionIndex: '0x0',
          type: '0x0',
        };
      }
      default:
        return null;
    }
  };

  return {
    request,
    calls,
    sentTxs,
    setNextTxHash: (h: Hex) => {
      nextTxHash = h;
    },
  };
}

export interface TestHarness {
  publicClient: PublicClient;
  walletClient: WalletClient;
  provider: ReturnType<typeof createMockProvider>;
  account: ReturnType<typeof privateKeyToAccount>;
}

export function makeHarness(handlers: MockProviderHandlers = {}): TestHarness {
  const provider = createMockProvider(handlers);
  const account = privateKeyToAccount(
    '0x0101010101010101010101010101010101010101010101010101010101010101',
  );
  const publicClient = createPublicClient({
    chain: erc721AiDevnet,
    transport: custom({ request: provider.request }),
  });
  const walletClient = createWalletClient({
    chain: erc721AiDevnet,
    account,
    transport: custom({ request: provider.request }),
  });
  return { publicClient, walletClient, provider, account };
}

export { Erc721AiAbi, Erc721AiMeteringAbi, Erc721AiAttestationHookAbi };
