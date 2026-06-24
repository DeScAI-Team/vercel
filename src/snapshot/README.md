# Snapshot access (local configuration)

Set these in your root `.env` (Vite exposes only `VITE_*` to the client):

| Variable | Purpose |
|----------|---------|
| `VITE_SNAPSHOT_RPC` | Base JSON-RPC URL for MetaMask “Add network” when Base is missing. **Required** for access checks. |
| `VITE_SNAPSHOT_AUTH_WORKER_URL` | Optional. Default `https://auth.descai.net` — returns tier + signed archive URL for a wallet. |
| `VITE_SNAPSHOT_ETH_WALLET_ADDRESS` | Treasury Base ETH address (donations section display). |
| `VITE_SNAPSHOT_ARWEAVE_WALLET` | Arweave donation address (display only). |
| `VITE_SNAPSHOT_AKT_WALLET` | Akash (AKT) donation address (display only). |

Unprefixed keys (`RPC`, `ETH_WALLET_ADDRESS`, etc.) are injected at dev/build time when `VITE_SNAPSHOT_*` is unset — see `.env.example`.

## Access flow

When a user connects MetaMask on Base (or clicks **Access snapshot**), the frontend calls:

`GET https://auth.descai.net/access?wallet=<address>`

Response:

```json
{
  "tier": "active" | "past" | "none",
  "tierDescription": "Human readable description",
  "browseUrl": "https://files.descai.net/browse?token=<jwt>",
  "expiresIn": 3600
}
```

The archive opens in a new tab. Tokens expire in one hour — do not cache `browseUrl`.

**Tiers:**

- **active** — donated in the last 30 days; all snapshots
- **past** — donated more than 30 days ago; snapshots up to 30 days after donation date
- **none** — never donated; snapshots older than 3 months (free preview)
