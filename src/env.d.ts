/// <reference types="vite/client" />

/** Injected in vite.config (unprefixed .env snapshot keys); empty strings when unset. */
declare const __SNAPSHOT_ENV_BRIDGE__: {
  treasuryEth: string;
  rpcUrl: string;
  arweaveDonation: string;
  aktDonation: string;
};

interface ImportMetaEnv {
  readonly VITE_ARWEAVE_INDEX_API_URL?: string;
  readonly VITE_ARWEAVE_GATEWAY_URL?: string;
  readonly VITE_DEFILLAMA_BASE_URL?: string;
  /** Snapshot / donations (see src/snapshot/README.md) */
  readonly VITE_SNAPSHOT_ETH_WALLET_ADDRESS?: string;
  readonly VITE_SNAPSHOT_RPC?: string;
  readonly VITE_SNAPSHOT_BASE_RPC?: string;
  readonly VITE_SNAPSHOT_ARWEAVE_WALLET?: string;
  readonly VITE_SNAPSHOT_AKT_WALLET?: string;
  readonly VITE_SNAPSHOT_AUTH_WORKER_URL?: string;
  /** Legacy aliases used if VITE_SNAPSHOT_* is unset */
  readonly VITE_ETH_WALLET_ADDRESS?: string;
  readonly VITE_RPC?: string;
  readonly VITE_ARWEAVE_WALLET_ADDRESS?: string;
  readonly VITE_AKT_WALLET_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type EthereumProvider = {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  /** True when this injector is MetaMask (used to pick the right provider when several wallets share `window.ethereum`). */
  isMetaMask?: boolean;
  /** Present when multiple wallets inject into the page; each entry is a separate EIP-1193 provider. */
  providers?: EthereumProvider[];
  on?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
  on?(event: "chainChanged", handler: (chainId: string) => void): void;
  removeListener?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
  removeListener?(event: "chainChanged", handler: (chainId: string) => void): void;
};

type ArweaveWalletProvider = {
  connect: (permissions: string[]) => Promise<void>;
  disconnect: () => Promise<void>;
  getActiveAddress: () => Promise<string>;
  getActivePublicKey: () => Promise<string>;
  sign: (transaction: unknown) => Promise<unknown>;
  signDataItem: (dataItem: {
    data: string | Uint8Array;
    target?: string;
    anchor?: string;
    tags?: Array<{ name: string; value: string }>;
  }) => Promise<ArrayBuffer | Uint8Array | number[]>;
  signMessage: (message: Uint8Array) => Promise<unknown>;
};

interface Window {
  ethereum?: EthereumProvider;
  arweaveWallet?: ArweaveWalletProvider;
}

declare module "process/browser" {
  import process from "node:process";
  export default process;
}
