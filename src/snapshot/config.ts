const trim = (value: string | undefined) => (typeof value === "string" ? value.trim() : "");

/** Custom domain on the blue-boat snapshot auth worker (Cloudflare Workers). */
export const DEFAULT_SNAPSHOT_AUTH_WORKER_URL = "https://auth.descai.net";

const snapshotBridge = __SNAPSHOT_ENV_BRIDGE__;

export type SnapshotClientConfig = {
  treasuryEth: string;
  rpcUrl: string;
  arweaveDonation: string;
  aktDonation: string;
  authWorkerUrl: string;
};

export const getSnapshotClientConfig = (): SnapshotClientConfig => ({
  treasuryEth:
    trim(import.meta.env.VITE_SNAPSHOT_ETH_WALLET_ADDRESS) ||
    trim(import.meta.env.VITE_ETH_WALLET_ADDRESS) ||
    snapshotBridge.treasuryEth,
  rpcUrl:
    trim(import.meta.env.VITE_SNAPSHOT_RPC) ||
    trim(import.meta.env.VITE_SNAPSHOT_BASE_RPC) ||
    trim(import.meta.env.VITE_RPC) ||
    snapshotBridge.rpcUrl,
  arweaveDonation:
    trim(import.meta.env.VITE_SNAPSHOT_ARWEAVE_WALLET) ||
    trim(import.meta.env.VITE_ARWEAVE_WALLET_ADDRESS) ||
    snapshotBridge.arweaveDonation,
  aktDonation:
    trim(import.meta.env.VITE_SNAPSHOT_AKT_WALLET) ||
    trim(import.meta.env.VITE_AKT_WALLET_ADDRESS) ||
    snapshotBridge.aktDonation,
  authWorkerUrl:
    trim(import.meta.env.VITE_SNAPSHOT_AUTH_WORKER_URL) || DEFAULT_SNAPSHOT_AUTH_WORKER_URL
});

export const isSnapshotConfigComplete = (config: SnapshotClientConfig) => Boolean(config.rpcUrl);
