export type SnapshotAccessTier = "active" | "past" | "none";

export type SnapshotAccessResult = {
  tier: SnapshotAccessTier;
  tierDescription: string;
  browseUrl: string;
  expiresIn: number;
};

const VALID_TIERS = new Set<SnapshotAccessTier>(["active", "past", "none"]);

const isSnapshotAccessTier = (value: unknown): value is SnapshotAccessTier =>
  typeof value === "string" && VALID_TIERS.has(value as SnapshotAccessTier);

const parseSnapshotAccessResult = (body: unknown): SnapshotAccessResult => {
  if (!body || typeof body !== "object") {
    throw new Error("Unexpected auth worker response.");
  }

  const record = body as Record<string, unknown>;
  const { tier, tierDescription, browseUrl, expiresIn } = record;

  if (!isSnapshotAccessTier(tier)) {
    throw new Error("Auth worker returned an invalid access tier.");
  }
  if (typeof tierDescription !== "string" || !tierDescription.trim()) {
    throw new Error("Auth worker returned an invalid tier description.");
  }
  if (typeof browseUrl !== "string" || !browseUrl.trim()) {
    throw new Error("Auth worker returned an invalid browse URL.");
  }
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Auth worker returned an invalid token expiry.");
  }

  return {
    tier,
    tierDescription: tierDescription.trim(),
    browseUrl: browseUrl.trim(),
    expiresIn
  };
};

export const fetchSnapshotAccess = async (
  authWorkerUrl: string,
  wallet: string
): Promise<SnapshotAccessResult> => {
  const base = authWorkerUrl.replace(/\/$/, "");
  const url = `${base}/access?wallet=${encodeURIComponent(wallet)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`Access check failed (${response.status}).`);
  }

  return parseSnapshotAccessResult(await response.json());
};
