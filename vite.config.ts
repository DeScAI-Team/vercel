/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const trimEnv = (value: string | undefined) => (typeof value === "string" ? value.trim() : "");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (env.VITE_MOLECULE_API_KEY) {
    throw new Error("Use MOLECULE_API_KEY instead of VITE_MOLECULE_API_KEY. Molecule secrets must stay server-side.");
  }

  /** Unprefixed keys from .env are not on import.meta.env; inject for snapshot UI only (see .env.example). */
  const snapshotEnvBridge = {
    treasuryEth: trimEnv(env.ETH_WALLET_ADDRESS),
    rpcUrl: trimEnv(env.RPC),
    arweaveDonation: trimEnv(env.ARWEAVE_WALLET_ADDRESS),
    aktDonation: trimEnv(env.AKT_WALLET_ADDRESS)
  };

  return {
    define: {
      __SNAPSHOT_ENV_BRIDGE__: JSON.stringify(snapshotEnvBridge)
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": "/src",
        "@dha-team/arbundles": "@dha-team/arbundles/web",
        crypto: "crypto-browserify",
        "node:crypto": "crypto-browserify",
        stream: "stream-browserify",
        "node:stream": "stream-browserify"
      }
    },
    server: {
      allowedHosts: ["changing-refugees-cold-bidding.trycloudflare.com"],
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true
        }
      }
    },
    test: {
      projects: [{
        extends: true,
        plugins: [
        // The plugin will run tests for the stories defined in your Storybook config
        // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{
              browser: 'chromium'
            }]
          },
          setupFiles: ['.storybook/vitest.setup.ts']
        }
      }]
    }
  };
});
