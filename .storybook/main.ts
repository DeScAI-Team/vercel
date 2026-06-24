import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "vite";
import type { StorybookConfig } from '@storybook/react-vite';

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const trimEnv = (value: string | undefined) => (typeof value === "string" ? value.trim() : "");

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": "@storybook/react-vite",
  viteFinal: async (config) => {
    const env = loadEnv("development", path.join(dirname, ".."), "");
    const snapshotEnvBridge = {
      treasuryEth: trimEnv(env.ETH_WALLET_ADDRESS),
      rpcUrl: trimEnv(env.RPC),
      arweaveDonation: trimEnv(env.ARWEAVE_WALLET_ADDRESS),
      aktDonation: trimEnv(env.AKT_WALLET_ADDRESS)
    };

    return {
      ...config,
      define: {
        ...config.define,
        __SNAPSHOT_ENV_BRIDGE__: JSON.stringify(snapshotEnvBridge)
      },
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias || {}),
          "@": path.resolve(dirname, "../src")
        }
      }
    };
  }
};
export default config;
